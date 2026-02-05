from pathlib import Path
from typing import List
from .neo4j_service import Neo4jService
from ..domain.models import MethodFlowItem

class GraphTraversalService:
    def __init__(self, neo4j_service: Neo4jService):
        self.neo4j = neo4j_service

    def get_method_flow(self, start_node_id: str) -> List[MethodFlowItem]:
        # print(f"Traversing graph starting from {start_node_id}.")
        
        # Cypher query for recursive traversal
        cypher_query = """
            MATCH (start:JMethod {id: $start_id})
            MATCH (start)-[:CALLS|CALLS_EXTERNAL*0..15]->(flow_node)
            WHERE flow_node:JMethod OR flow_node:ExternalAPI

            RETURN 
                DISTINCT flow_node.id AS id,
                flow_node.name AS name,
                flow_node.path AS path,
                flow_node.protection AS protection
            """
        
        try:
            with self.neo4j.get_session() as session:
                result = session.run(cypher_query, start_id=start_node_id)
                
                method_flow: List[MethodFlowItem] = []
                
                for record in result:
                    method_flow.append(MethodFlowItem(
                        id=record["id"],
                        source_file_path=Path(record["path"]) if record["path"] else Path(),
                        method_name=record["name"],
                        node_type=self._get_node_type(record["id"]),
                        protection=record["protection"]
                    ))
                
                # print(f"Traversal complete. Found {len(method_flow)} methods in the flow.")
                return method_flow
                
        except Exception as e:
            print(f"Error during graph traversal for ID {start_node_id}: {e}")
            return []
    
    def _get_node_type(self, _id:str):
        _id = _id.lower()
        if 'service' in _id:
            return 'Business Service'
        if 'repository' in _id:
            return 'Repository'
        if 'controller' in _id:
            return 'Endpoint'
        else: return 'Unknown'
