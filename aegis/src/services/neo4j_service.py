from neo4j import GraphDatabase, Session
from typing import List, Dict, Any

class Neo4jService:
    def __init__(self, uri, user, password):
        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            self.driver.verify_connectivity()
            # print("Neo4j connection successful.")
        except Exception as e:
            # print(f"CRITICAL ERROR: Could not connect to Neo4j at {uri}. {e}")
            exit(1)

    def close(self):
        # Closes the connection to the database.
        self.driver.close()

    def run_query(self, query: str, parameters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        # Executing semantic queries on the database.
        with self.driver.session() as session:
            result = session.run(query, parameters)
            return [record.data() for record in result]
     
    def clear_database(self):
        # Clean the database completely.
        # print("Clearing Neo4j database...")
        self.run_query("MATCH (n) DETACH DELETE n")
        # print("Database cleared.")

    def get_session(self) -> Session:
        # Retrieve the connection session to the database.
        return self.driver.session()