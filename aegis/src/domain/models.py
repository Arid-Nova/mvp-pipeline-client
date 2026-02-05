from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class Opinion:
    belief: float
    disbelief: float
    uncertainty: float

    def __post_init__(self):
        """Validates that the opinion is a valid trinomial."""
        total = self.belief + self.disbelief + self.uncertainty
        # Use a small tolerance for floating point comparisons
        if not 0.999 < total < 1.001:
            raise ValueError(f"Opinion values must sum to 1. Got: {total}")

    def __str__(self):
        return f"(b={self.belief:.3f}, d={self.disbelief:.3f}, u={self.uncertainty:.3f})"
    
@dataclass
class SymbolicEvidence:
    # DTO to contain the raw values for symbolic evidence.
    # Binary
    binary_findings: List[str] = field(default_factory=list)
    # Variable 
    path_length: int = 0
    agg_cyclomatic_complexity: int = 0
    shared_sensitive_entities: int = 0
    database_access_count: int = 0
    external_call_count: int = 0

@dataclass
class NeuroEvidence:
    # DTO to contain the raw values for LLM evidence.
    finding: str
    confidence: float
    polarity: str  # "risk-increasing" or "risk-decreasing" or "unsure"
    context: str

@dataclass
class MethodFlowItem:
    id: str 
    node_type : str
    method_name : str
    source_file_path : Path
    protection: Optional[str] = None

@dataclass
class ExecutionPath:
    # This is the main DTO representing an execution path.
    # It will be progressively enriched as it moves through the pipeline.

    id: str 
    http_method: str
    path_template: str
    
    # Raw JSON data from the IR for context
    raw_ir_data: Dict[str, Any]
    
    # Path to the source file and method name
    source_file_path: Optional[str] = None
    method_name: Optional[str] = None
    
    # Symbolic Evidence
    symbolic_evidence: Optional[SymbolicEvidence] = None
    
    # Neuro-Centric Evience 
    neuro_evidence: List[NeuroEvidence] = field(default_factory=list)
    
    # Mapped Evidence
    initial_opinions: List[Opinion] = field(default_factory=list)
    
    # Fused Opinion
    fused_opinion: Optional[Opinion] = None

    # Temporary call graph starting from this endpoint.
    method_flow: List[MethodFlowItem] = field(default_factory=list) 