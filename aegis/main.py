import gzip
import os
import time
import json
import dataclasses
import concurrent.futures
from typing import List, Dict, Any

import requests

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

    def __init__(self):        
        # 1. Initialize core services
        # ("Initializing Aegis services...")
        # Initializing the graph database.
        self.neo4j_service = Neo4jService(
            uri = os.getenv('NEO4J_URI'),
            user = os.getenv('NEO4J_USERNAME'),
            password = os.getenv('NEO4J_PASSWORD')
        )

        # Initializing the mongo database.
        self.mongo_service = MongoService(
            uri = os.getenv('MONGO_URI'),
            db_name = os.getenv('MONGO_DB_NAME')
        )

        self.ir_endpoint = os.getenv('IR_SERVICE_URL', 'http://backend:8080/ir/create')
        
        # 2. Initialize graph loader
        self.graph_loader = GraphLoader(self.neo4j_service)
        
        # 3. Initialize analyzers
        self.symbolic_analyzer = SymbolicAnalyzer(self.neo4j_service)

        # 4. Initializing call graph extracting.
        self.traversal_service = GraphTraversalService(self.neo4j_service)
        
        # 5. Initialize calculus modules
        script_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(script_dir, 'configs')
        self.evidence_mapper = EvidenceMapper(config_path)
        
        # Load AHP/metric configs
        self.config_loader = ConfigLoader()
        # print("Initialization complete.")

    def get_latent_vulnerabilities(self, ir_id: str, analyzed_paths: List[ExecutionPath]) -> List[Dict[str, Any]]:
        if getattr(self, 'neuro_analyzer', None) is None:
            self.neuro_analyzer = NeuroAnalyzer(None, None)
        
        results = self.neuro_analyzer.analyse_latent_vulnerabilities(analyzed_paths)
        self.update_results_with_vulnerabilities(ir_id, results)

        return results
    
    def _get_ir_for_analysis(self, ir_id: str) -> Dict[str, Any]:
        payload = {
            "id": ir_id,
            "systemName": "",
            "systemRepositories": []
        }

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/gzip"
        }
        
        try:
            response = requests.post(self.ir_endpoint, json=payload, headers=headers, timeout=30)
            if response.status_code != 200:
                response.raise_for_status()

            decompressed_data = gzip.decompress(response.content)
            ir_data = json.loads(decompressed_data)
            
            return ir_data
        except requests.exceptions.RequestException as e:
            print(f"Error fetching IR data: {e}")
            raise
        except Exception as e:
            print(f"Error parsing IR data: {e}")
            raise

    def run_analysis(self, payload: Dict[str, Any], max_workers: int = 3) -> List[ExecutionPath]:
        # Executes the end-to-end analysis pipeline.
        print("\nStarting AEGIS analysis!")
        start_time = time.perf_counter()

        # Checking if analysis has already been performed.
        existing = self.mongo_service.find(os.getenv('MONGO_COLLECTION_NAME'), {
            "irID": payload['ir_id']
        })

        if existing:
            # print(f"Analysis already exists for system '{payload['name']}' with commit ID '{payload['commitID']}'.")
            # print("Returning existing results.")
            return existing[0]
        
        # Initalizing the GIT code fetching mechanism.
        self.code_fetcher = CodeFetcher(payload['repoUrl'], payload['branch'])

        # Load graph and get execution paths
        # But, first need to fetch the IR 
        ir = self._get_ir_for_analysis(payload['ir_id'])
        execution_paths = self.graph_loader.load_graph_from_ir(ir, self.code_fetcher.get_temp_dir())
        
        if not execution_paths:
            print("No execution paths found. Exiting.")
            return []
            
        # print(f"\nFound {len(execution_paths)} execution paths to analyze.")
        
        analyzed_paths = []
        self.neuro_analyzer = NeuroAnalyzer(self.code_fetcher, self.traversal_service)
        # total_paths = len(execution_paths)

        # 1. Worker function for a single path
        def process_single_path(path_info):
            _, path = path_info
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
                
                # print(f"({i+1}/{len(execution_paths)}) ANALYSIS COMPLETE for {path.id}.")
                # print(f"ANALYSIS COMPLETE for {path.id}. Final Opinion: {path.fused_opinion}")
                # analyzed_paths.append(path)
                return path
            
            except Exception as e:
                print(f"CRITICAL ERROR analyzing path {path.id}: {e} !!!")
                return None

        # 2. Concurrent processing of paths
        path_tuples = [(i, path) for i, path in enumerate(execution_paths)]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(process_single_path, pt) for pt in path_tuples]
            
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    analyzed_paths.append(result)
        
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time

        print(f"\nAEGIS full analysis completed! Execution time: {elapsed_time:.6f} seconds")

        # 3. Format the output
        results = []
        if analyzed_paths:
            for path in analyzed_paths:
                # Convert dataclass to dict
                path_dict = dataclasses.asdict(path)
                path_dict.pop("method_flow", None)             
                results.append(path_dict)

        # Compresing results befpre saving to DB
        json_str = json.dumps(results)
        compressed_results = gzip.compress(json_str.encode('utf-8'))

        self.save_results_to_db({
            "system_name": payload['ir']['name'],
            "irID": payload['ir_id'],
            "timestamp": time.time(),
            "results": compressed_results
        })

        return results

    def update_results_with_vulnerabilities(self, ir_id: str, vulnerabilities: List[Dict[str, Any]]):
        # Updates the existing analysis results with the newly found latent vulnerabilities.
        try:
            existing = self.mongo_service.find(os.getenv('MONGO_COLLECTION_NAME'), {
                "irID": ir_id
            })

            if not existing:
                print(f"No existing analysis found for IR ID '{ir_id}'. Cannot update vulnerabilities.")
                return False
            
            existing_result = existing[0]

            # Compressing before updating to DB
            vuln_json = json.dumps(vulnerabilities)
            compressed_vulns = gzip.compress(vuln_json.encode('utf-8'))
            existing_result['vulnerabilities'] = compressed_vulns

            self.mongo_service.update(
                os.getenv('MONGO_COLLECTION_NAME'), 
                {"_id": existing_result['_id']}, existing_result)
            print(f"Successfully updated vulnerabilities for IR ID '{ir_id}'.")
            return True

        except Exception as e:
            print(f"Error updating results with vulnerabilities: {e}")
            return False

    def save_results_to_db(self, results_dict: Dict[str, Any]):
        # Saves the final "Opinion Vector" to MongoDB.
        try:
            result_id = self.mongo_service.insert(os.getenv('MONGO_COLLECTION_NAME'), results_dict)
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