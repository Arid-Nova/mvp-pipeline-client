from ..services.neo4j_service import Neo4jService
from ..domain.models import SymbolicEvidence, ExecutionPath
from typing import List

class SymbolicAnalyzer:
    # Analyzes the Neo4j graph to extract symbolic evidence for each execution path.
    def __init__(self, neo4j_service: Neo4jService):
        self.neo4j = neo4j_service

    def analyze(self, execution_path: ExecutionPath) -> SymbolicEvidence:
        # Runs all symbolic analyses for a single execution path.
        evidence = SymbolicEvidence()
        endpoint_id = execution_path.id

        # 1. Find all binary evidence
        all_binary_findings = []
        all_binary_findings.extend(self._find_auth_evidence(endpoint_id))
        all_binary_findings.extend(self._find_hardcoded_secrets(endpoint_id))
        all_binary_findings.extend(self._find_sql_injection_sinks(endpoint_id))

        evidence.binary_findings = all_binary_findings
        
        # 2. Path Length (PL) - INTER-SERVICE
        evidence.path_length = self._get_path_length(execution_path.id)
        
        # 3. Aggregated Cyclomatic Complexity (AC)
        evidence.agg_cyclomatic_complexity = self._get_path_complexity(execution_path.id)

        # 4. Shared Sensitive Entities (SSE)
        evidence.shared_sensitive_entities = self._get_shared_entities(execution_path.id)

        # 5. Database Access Count (DAC)
        evidence.database_access_count = self._get_database_access_count(execution_path.id)
        
        # 6. External Call Count (ECC)
        evidence.external_call_count = self._get_external_call_count(execution_path.id)

        return evidence

    def _find_auth_evidence(self, endpoint_id: str) -> List[str]:
        # Finds all authorization-related binary evidence (positive and negative).
        # Returns a list of keys corresponding to ahp_benchmarks.json.

        findings = []
        query = """
        MATCH (e:Endpoint {id: $id})
        OPTIONAL MATCH (e)-[:CALLS*0..]->(method)
        OPTIONAL MATCH (method)-[:HAS_ANNOTATION]->(a)
        RETURN collect(DISTINCT a.name) as annotations
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        if not result:
            return ["LDA"] 

        annotations = result[0].get("annotations", [])   
        auth_ann_set = {ann for ann in annotations if ann} 

        # 1. Define our known auth annotations from the config
        known_auth_anns = {
            'PreAuthorize', 'PostAuthorize', 'Secured', 'RequiresAuthentication', 
            'RequiresAdmin', 'RolesAllowed', 'DenyAll', 'PermitAll', 'DeclareRoles',
            'RunAs', 'Validated', 'CrossOrigin', 'EnableWebSecurity'
        }
        
        # 2. Check for NEGATIVE evidence
        if not auth_ann_set.intersection(known_auth_anns):
            findings.append("LDA") # Lack of Definite Authorization
        
        # 3. Check for POSITIVE evidence
        if auth_ann_set.intersection({'RequiresAdmin', 'PreAuthorize', 'PostAuthorize'}):
            findings.append("REQUIRES_ADMIN")
        
        if auth_ann_set.intersection({'Secured', 'RequiresAuthentication', 'RolesAllowed', 'DeclareRoles', 'RunAs', 'EnableWebSecurity'}):
            findings.append("REQUIRES_AUTH")
            
        if auth_ann_set.intersection({'Valid', 'Pattern', 'CrossOrigin'}):
            findings.append("INPUT_VALIDATION")


        # Checking if the endpoint is unprotected.
        query2 = """
        MATCH (e:Endpoint {id: $id})
        WHERE e.protection = 'PUBLIC'
        RETURN 'UNPROTECTED_ENDPOINT' as finding
        LIMIT 1
        """
        result2 = self.neo4j.run_query(query2, {"id": endpoint_id})
        findings.extend([r["finding"] for r in result2])

        # Enriching the graph with binary findings.
        # for i, finding in enumerate(findings): 
        #     self.neo4j.run_query(
        #         """
        #         MATCH (e:Endpoint {id: $id})
        #         MERGE (f:Finding {id: $fid})
        #         ON CREATE SET 
        #             f.type = $ftype, 
        #             f.source = 'StaticAnalysis'
        #         MERGE (e)-[:HAS_FINDING]->(f)
        #         """,
        #         id=endpoint_id,
        #         fid =f"{endpoint_id}_binary_finding_{i}",
        #         ftype='Binary'
        #     )

        return findings
    
    def _find_hardcoded_secrets(self, endpoint_id: str) -> List[str]:
        # Finds hardcoded secrets in the call chain.
        # This is a heuristic and assumes the IR is enriched with string literals
        # or that another tool has added a 'HardcodedSecret' finding.

        query = """
        MATCH (startMethod:Endpoint {id: $id})
        MATCH (startMethod)<-[:HAS_METHOD]-(:JClass)<-[:HAS_CLASS]-(ms:Microservice)

        // Check for HardcodedSecret findings on the Microservice
        OPTIONAL MATCH (ms)-[:HAS_FINDING]->(f:Finding {type: 'HardcodedSecret'})

        WITH ms, count(f) as match_count
        WHERE match_count > 0
        RETURN "HARDCODED_SECRET" as finding
        LIMIT 1
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        return [r['finding'] for r in result]

    def _find_sql_injection_sinks(self, endpoint_id: str) -> List[str]:
        # Finds SQLi sinks. This REQUIRES the IR to be pre-enriched by a
        # data-flow analysis (taint) tool.

        query = """
        MATCH (startMethod:Endpoint {id: $id})
        OPTIONAL MATCH (startMethod)-[:CALLS*]->(method)
        
        WITH startMethod, collect(DISTINCT method) as called_methods
        
        WITH called_methods + startMethod as all_methods
        UNWIND all_methods as m
        
        MATCH (m)-[:HAS_FINDING]->(f:Finding {type: 'SQLiSink'})
        
        RETURN "SQL_INJECTION_SINK" as finding
        LIMIT 1
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        return [r['finding'] for r in result]

    def _get_path_length(self, endpoint_id: str) -> int:
        # Finds the longest call chain (Path Length) from this endpoint.

        query = """
        MATCH (startMethod:Endpoint {id: $id})
        OPTIONAL MATCH path = (startMethod)-[:CALLS*]->(endMethod)
        WHERE NOT (endMethod)-[:CALLS]->()
        WITH path
        ORDER BY length(path) DESC
        LIMIT 1
        RETURN length(path) as max_depth
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        
        if not result or result[0]["max_depth"] is None:
            return 0  # No calls
        return result[0]["max_depth"]

    def _get_path_complexity(self, endpoint_id: str) -> int:
        # Finds all methods in the call chain and sums their cyclomatic complexity.
        # We assume the IR provided a 'cyclomaticComplexity' property on JMethods.

        query = """
        MATCH (s:Endpoint {id: $id})
        OPTIONAL MATCH (s)-[:CALLS*]->(m)

        WITH s, collect(DISTINCT m) as methods
        
        WITH methods + s as all_methods
        UNWIND all_methods as m
        
        RETURN sum(coalesce(m.cyclomaticComplexity, 1)) as total
        """
        res = self.neo4j.run_query(query, {"id": endpoint_id})
        return res[0]['total'] if res else 0

    def _get_shared_entities(self, endpoint_id: str) -> int:
        # Finds data entities accessed by this path that are also
        # accessed by other microservices.

        query = """
        MATCH (startNode:Endpoint {id: $id})
        MATCH (startNode)<-[:HAS_METHOD]-(:Controller)<-[:HAS_CLASS]-(ms:Microservice)
        WITH startNode, ms.name as start_service_name
        
        // 2. Find all data entities this path accesses
        OPTIONAL MATCH (startNode)-[:CALLS*]->(method)

        WITH startNode, start_service_name, collect(method) as methods
        
        // Now combine them into a single list
        WITH methods + startNode as path_methods, start_service_name
        UNWIND path_methods as m
        MATCH (m)-[:ACCESSES]->(entity:DataEntity)
        WITH DISTINCT entity, start_service_name
        
        // 3. Find if any of these entities are accessed by other services
        MATCH (entity)<-[:ACCESSES]-(other_method)
        MATCH (other_method)<-[:HAS_METHOD]-(:JClass)<-[:HAS_CLASS]-(other_ms:Microservice)
        WHERE other_ms.name <> start_service_name
        
        // 4. Return the count of distinct shared entities
        RETURN count(DISTINCT entity) as shared_entity_count
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        
        if not result:
            return 0
        return result[0]["shared_entity_count"]
    
    def _get_database_access_count(self, endpoint_id: str) -> int:
        # Counts all :ACCESSES relationships in the full call chain.

        query = """
        MATCH (startMethod:Endpoint {id: $id})
        OPTIONAL MATCH (startMethod)-[:CALLS*]->(method)
        
        WITH startMethod, collect(DISTINCT method) as methods
        
        WITH methods + startMethod as all_methods
        UNWIND all_methods as m
        
        OPTIONAL MATCH (m)-[r:ACCESSES]->(:DataEntity)
        RETURN count(r) as dac_count
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        
        if not result:
            return 0
        return result[0]["dac_count"]

    def _get_external_call_count(self, endpoint_id: str) -> int:
        # Counts all :CALLS_EXTERNAL relationships in the full call chain.
        # This relies on the GraphLoader correctly creating :ExternalCall nodes.

        query = """
        MATCH (startMethod:Endpoint {id: $id})
        OPTIONAL MATCH (startMethod)-[:CALLS*]->(method)
        
        WITH startMethod, collect(DISTINCT method) as methods

        WITH methods + startMethod as all_methods
        UNWIND all_methods as m
        
        OPTIONAL MATCH (m)-[r:CALLS_EXTERNAL]->()
        RETURN count(r) as ecc_count
        """
        result = self.neo4j.run_query(query, {"id": endpoint_id})
        
        if not result:
            return 0
        return result[0]["ecc_count"]