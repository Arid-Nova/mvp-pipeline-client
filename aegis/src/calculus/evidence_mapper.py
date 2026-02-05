from abc import ABC, abstractmethod
from typing import List, Dict, Any
from ..domain.models import ExecutionPath, Opinion, SymbolicEvidence, NeuroEvidence
from ..config_loader import ConfigLoader

# The Strategy Interface
class EvidenceMappingStrategy(ABC):
    # Abstract base class for all evidence mapping strategies.
    # This is the "Strategy" in the Strategy Pattern.
    
    @abstractmethod
    def map(self, execution_path: ExecutionPath) -> List[Opinion]:
        pass

# Concrete Strategies
class BinaryEvidenceStrategy(EvidenceMappingStrategy):
    # Maps binary findings from the ahp_benchmarks.json config.
    def __init__(self):
        self.config = ConfigLoader()

    def map(self, execution_path: ExecutionPath) -> List[Opinion]:
        ops = []
        evidence = execution_path.symbolic_evidence
        
        # Guard clause
        if not evidence or not evidence.binary_findings:
            return ops

        # Iterate over the list of finding keys provided by the SymbolicAnalyzer
        for finding_key in evidence.binary_findings:
            opinion_dict = self.config.get_ahp_opinion(finding_key)
            
            if opinion_dict:
                ops.append(Opinion(**opinion_dict))
            else:
                print(f"Warning: No AHP benchmark found for finding '{finding_key}'. Skipping.")
        
        return ops

class VariableMetricStrategy(EvidenceMappingStrategy):
    """Maps variable metrics using the dynamic functions."""
    
    def __init__(self):
        self.config = ConfigLoader()
        self.metric_map = {
            "PL": "path_length",
            "AC": "agg_cyclomatic_complexity",
            "SSE": "shared_sensitive_entities",
            "DAC": "database_access_count",
            "ECC": "external_call_count",
        }

    def _calculate_opinion(self, value: float, thresholds: Dict[str, Any]) -> Opinion:
        # Implements the dynamic mapping function from the paper.
        min_val = thresholds.get("min_val", 0)
        max_val = thresholds.get("max_val", 1)
        max_d = thresholds.get("max_disbelief", 0.5)
        
        if max_val == min_val: # Avoid division by zero
            return Opinion(0.0, 0.0, 1.0)
            
        # 1. Normalize to risk factor x
        x = (value - min_val) / (max_val - min_val)
        x = max(0.0, min(1.0, x))  # Clamp between 0 and 1

        # 2. Calculate opinion
        disbelief = x * max_d
        return Opinion(belief=0.0, disbelief=disbelief, uncertainty=1.0 - disbelief)

    def map(self, execution_path: ExecutionPath) -> List[Opinion]:
        ops = []
        evidence = execution_path.symbolic_evidence
        if not evidence:
            return ops
        
        for key, attr_name in self.metric_map.items():
            thresholds = self.config.get_metric_thresholds(key)
            if not thresholds:
                print(f"Warning: No thresholds found for metric {key}. Skipping.")
                continue
                
            value = getattr(evidence, attr_name, 0)
            ops.append(self._calculate_opinion(value, thresholds))
            
        return ops

class NeuroEvidenceStrategy(EvidenceMappingStrategy):
    # Maps NeuroEvidence from the LLM into opinions.

    def map(self, execution_path: ExecutionPath) -> List[Opinion]:
        ops = []
        for evidence in execution_path.neuro_evidence:
            confidence = evidence.confidence
            
            if evidence.polarity == "risk-increasing":
                ops.append(Opinion(belief=0.0, disbelief=confidence, uncertainty=1.0 - confidence))
            elif evidence.polarity == "risk-decreasing":
                ops.append(Opinion(belief=confidence, disbelief=0.0, uncertainty=1.0 - confidence))
            elif evidence.polarity == "unsure":
                rest = 1.0 - confidence
                equal_inconfidence = rest / 2.0
                ops.append(Opinion(belief=equal_inconfidence, disbelief=equal_inconfidence, uncertainty=confidence))

        return ops

# The Context Class
class EvidenceMapper:
    # The "Context" class in the Strategy Pattern. It holds all mapping
    # strategies and runs them to populate the initial_opinions list.

    def __init__(self):
        self.strategies: List[EvidenceMappingStrategy] = [
            BinaryEvidenceStrategy(),
            VariableMetricStrategy(),
            NeuroEvidenceStrategy()
        ]

    def map_all_evidence(self, execution_path: ExecutionPath) -> ExecutionPath:
        # Runs all mapping strategies on an ExecutionPath and updates its `initial_opinions` list.

        all_opinions = []
        for strategy in self.strategies:
            all_opinions.extend(strategy.map(execution_path))
            
        execution_path.initial_opinions = all_opinions
        return execution_path