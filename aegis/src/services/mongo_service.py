from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from typing import List, Dict, Any, Optional

class MongoService:
    def __init__(self, uri: str, db_name: str):
        try:
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            
            self.db = self.client[db_name]
            # print(f"MongoDB connection successful to database: {db_name}")
            
        except (ConnectionFailure, ServerSelectionTimeoutError):
            # print(f"Could not connect to MongoDB at {uri}. {e}")
            exit(1)

    def close(self):
        self.client.close()

    def find(self, collection: str, query: Dict[str, Any] = None, projection: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        if query is None:
            query = {}
        
        try:
            cursor = self.db[collection].find(query, projection)
            # Convert cursor to list of dicts immediately to match Neo4j 'record.data()' behavior
            return list(cursor)
        except Exception as e:
            print(f"Error querying collection {collection}: {e}")
            return []

    def insert(self, collection: str, data: Dict[str, Any]) -> Optional[str]:
        try:
            result = self.db[collection].insert_one(data)
            return str(result.inserted_id)
        except Exception as e:
            print(f"Error inserting into {collection}: {e}")
            return None
        
    def update(self, collection_name: str, query: Dict[str, Any], document: Dict[str, Any], upsert: bool = False) -> bool:
        try:
            collection = self.db[collection_name]
            
            update_payload = document.copy()

            if '_id' in update_payload:
                del update_payload['_id']
                
            update_operator = {"$set": update_payload}
            
            result = collection.update_one(query, update_operator, upsert=upsert)
            
            return result.modified_count > 0 or (upsert and result.upserted_id is not None)
            
        except Exception as e:
            print(f"Error updating document in collection '{collection_name}': {e}")
            return False

    def clear_database(self):
        # print("Clearing MongoDB database...")
        self.client.drop_database(self.db.name)

        self.db = self.client[self.db.name]
        # print("Database cleared.")

    def get_db(self):
        return self.db