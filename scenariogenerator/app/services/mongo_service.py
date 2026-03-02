
import threading
from typing import List, Dict, Any, Optional

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

class MongoService:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, uri: str, db_name: str, username: str = None, password: str = None):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(MongoService, cls).__new__(cls)
                    cls._instance._connect(uri, db_name, username, password)
        
        return cls._instance

    def _connect(self, uri: str, db_name: str, username: str = None, password: str = None):
        try:
            self.client = MongoClient(
                uri, 
                username=username, 
                password=password, 
                serverSelectionTimeoutMS=5000
            )
            self.client.admin.command('ping')
            self.db = self.client[db_name]           
        
        except (ConnectionFailure, ServerSelectionTimeoutError):
            exit(1)

    def close(self):
        if self.client:
            self.client.close()
            MongoService._instance = None

    def find(self, collection: str, query: Dict[str, Any] = None, projection: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        if query is None:
            query = {}
        
        try:
            cursor = self.db[collection].find(query, projection)
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
        
    def insert_many(self, collection: str, documents: List[Dict[str, Any]]) -> bool:
        try:
            self.db[collection].insert_many(documents)
            return True
        except Exception as e:
            print(f"Error inserting multiple documents into {collection}: {e}")
            return False
    
    def aggregate(self, collection: str, pipeline: list):
        try:
            return list(self.db[collection].aggregate(pipeline))
        except Exception as e:
            print(f"MongoDB Aggregate Error: {e}")
            return []

    def clear_database(self):
        # print("Clearing MongoDB database...")
        self.client.drop_database(self.db.name)

        self.db = self.client[self.db.name]
        # print("Database cleared.")

    def get_db(self):
        return self.db