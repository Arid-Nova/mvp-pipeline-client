import os
import time
import json
import dataclasses
from typing import List, Dict, Any

# Import all our modules
from src.config_loader import ConfigLoader
from src.domain.models import ExecutionPath
from src.services.graph_loader import GraphLoader
from src.services.code_fetcher import CodeFetcher
from src.services.neo4j_service import Neo4jService
from src.services.mongo_service import MongoService
from src.analysis.neuro_analyzer import NeuroAnalyzer
from src.calculus.evidence_mapper import EvidenceMapper
from src.analysis.symbolic_analyzer import SymbolicAnalyzer
from src.services.graph_traversal_service import GraphTraversalService

from src.calculus.subjective_logic import fuse_opinions_list

class AnalysisFacade:
    # Orchestrates the entire Aegis pipeline.
    # This acts as the main entry point and Facade.

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # 1. Initialize core services
        # ("Initializing Aegis services...")
        # Initializing the graph database.
        self.neo4j_service = Neo4jService(
            uri=config['NEO4J']['uri'],
            user=config['NEO4J']['username'],
            password=config['NEO4J']['password']
        )

        # Initializing the mongo database.
        self.mongo_service = MongoService(
            uri=config['MONGO']['uri'],
            db_name=config['MONGO']['db_name']
        )
        
        # 2. Initialize graph loader
        self.graph_loader = GraphLoader(self.neo4j_service)
        
        # 3. Initialize analyzers
        self.symbolic_analyzer = SymbolicAnalyzer(self.neo4j_service)

        # 4. Initializing call graph extracting.
        self.traversal_service = GraphTraversalService(self.neo4j_service)
        
        self.llm_config = config['LLM']
        if self.llm_config['provider'] == 'openai':
            if not 'api_key' in self.llm_config:
                # Securely get API key from environment
                self.llm_config['api_key'] = os.getenv("API_KEY")
                if not self.llm_config['api_key']:   
                    raise ValueError("OPENAI_API_KEY environment variable not set.")
        
        # 5. Initialize calculus modules
        self.evidence_mapper = EvidenceMapper()
        
        # Load AHP/metric configs
        self.config_loader = ConfigLoader()
        # print("Initialization complete.")

    def run_analysis(self, payload: Dict[str, Any]) -> List[ExecutionPath]:
        # Executes the end-to-end analysis pipeline.
        print("\nStarting AEGIS analysis!")
        start_time = time.perf_counter()
        ir_id = payload['ir']['id']

        # Checking if analysis has already been performed.
        existing = self.mongo_service.find(self.config['MONGO']['collection_name'], {
            "irID": ir_id
        })

        if existing:
            # print(f"Analysis already exists for system '{payload['name']}' with commit ID '{payload['commitID']}'.")
            # print("Returning existing results.")
            return existing[0]['results']
        
        # Initalizing the GIT code fetching mechanism.
        self.code_fetcher = CodeFetcher(payload['repoUrl'], payload['branch'])

        # Load graph and get execution paths
        execution_paths = self.graph_loader.load_graph_from_ir(payload, self.code_fetcher.get_temp_dir())
        
        if not execution_paths:
            print("No execution paths found. Exiting.")
            return []
            
        # print(f"\nFound {len(execution_paths)} execution paths to analyze.")
        
        analyzed_paths = []
        self.neuro_analyzer = NeuroAnalyzer(self.code_fetcher, self.traversal_service, self.llm_config)
        
        for i, path in enumerate(execution_paths):
            # print(f"\nAnalyzing Path {i+1}/{len(execution_paths)}: {path.id}.")

            try:
                # Step 1: Symbolic Analysis
                # print(f"[Step 1] Running symbolic analysis for {path.id}.")
                path.symbolic_evidence = self.symbolic_analyzer.analyze(path)

                # Step 2: Neuro-Centric Analysis
                # print(f"[Step 2] Running neuro-centric analysis for {path.id}.")
                path = self.neuro_analyzer.analyze(path)
                
                # Step 3: Evidence Mapping
                # print(f"[Step 3] Mapping evidence to opinions for {path.id}.")
                path = self.evidence_mapper.map_all_evidence(path)
                
                # Step 4: Opinion Fusion
                # print(f"[Step 4] Fusing {len(path.initial_opinions)} opinions for {path.id}.")
                path.fused_opinion = fuse_opinions_list(path.initial_opinions)
                
                print(f"({i+1}/{len(execution_paths)}) ANALYSIS COMPLETE for {path.id}.")
                # print(f"ANALYSIS COMPLETE for {path.id}. Final Opinion: {path.fused_opinion}")
                analyzed_paths.append(path)
                
            except Exception as e:
                print(f"CRITICAL ERROR analyzing path {path.id}: {e} !!!")
                continue

        end_time = time.perf_counter()
        elapsed_time = end_time - start_time

        print(f"\nAEGIS full analysis completed! Execution time: {elapsed_time:.6f} seconds")
    
        # Format the output
        results = []
        if analyzed_paths:
            for path in analyzed_paths:
                # Convert dataclass to dict
                path_dict = dataclasses.asdict(path)
                path_dict.pop("method_flow", None)             
                results.append(path_dict)

        self.save_results_to_db({
            "system_name": payload['ir']['name'],
            "irID": ir_id,
            "timestamp": time.time(),
            "results": results
        })

        return results

    def save_results_to_db(self, results_dict: Dict[str, Any]):
        # Saves the final "Opinion Vector" to MongoDB.
        try:
            result_id = self.mongo_service.insert(self.config['MONGO']['collection_name'], results_dict)
            if result_id:
                print(f"\nSuccessfully saved Opinion Vector to MongoDB with ID: {result_id}")
            else:
                print("\nFailed to save Opinion Vector to MongoDB.")
        except Exception as e:
            print(f"Error saving results to MongoDB: {e}")

    
    def save_results_to_file(self, analyzed_paths: List[ExecutionPath], output_file: str):
        # Saves the final "Opinion Vector" to a JSON file.
        # Convert dataclasses to a list of dicts for JSON serialization

        results_list = []
        for path in analyzed_paths:
            d_class = dataclasses.asdict(path)
            d_class.pop("method_flow", None)
            results_list.append(d_class)
            
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results_list, f, indent=2)
            
        # print(f"\nSuccessfully saved Opinion Vector to {output_file}")

    def cleanup(self):
        # print("\nCleaning up resources.")
        self.code_fetcher.cleanup()
        self.neo4j_service.close()
        # print("Cleanup complete.")