from ..utils.decompress import decompress_field

from .mongo_service import MongoService
from ..models.generatescenarios import GenerateScenariosRequest, FullGenerateScenariosRequest

from bson.objectid import ObjectId
from typing import Any, Dict, List

import os

class DataService:
    def __init__(self, uri: str = None, db_name: str = None, username: str = None, password: str = None):
        
        uri = uri or os.getenv("MONGO_URI", "mongodb://localhost:27017/")
        db_name = db_name or os.getenv("MONGO_DB", "aridnova-testing")
        username = username or os.getenv("MONGO_USER", "root")
        password = password or os.getenv("MONGO_PASSWORD")
        
        self.mongo_service = MongoService(
            uri=uri,
            db_name=db_name,
            username=username,
            password=password,
        )

    def fetch_index_data(self, request: GenerateScenariosRequest):
        response = self.fetch_endpoint_component_indexes(request.index_id)

        response = FullGenerateScenariosRequest(
            all_vectors=self.fetch_auth_vectors(request.vectors_id),
            endpoints=self.fetch_endpoints(response.get("endpointId")),
            components=self.fetch_components(response.get("componentId"))
        )

        return response

    def fetch_endpoint_component_indexes(self, index_id: str) -> dict:
        try:
            query = {"_id": ObjectId(index_id)}
        except Exception as e:
            print(f"Invalid ID format provided: {e}")
            return {} 

        results = self.mongo_service.find(collection="microservice_index", query=query)

        if results:
            document = results[0] 
            return {
                "endpointId": document.get("endpointId"),
                "componentId": document.get("componentId")
            }
        
        print(f"No index found with ID: {index_id}")
        return {}
    
    def fetch_endpoints(self, endpoint_id: str) -> dict:
        try:
            query = {"_id": ObjectId(endpoint_id)}
        except Exception as e:
            print(f"Invalid endpoint ID format provided: {e}")
            return {}
        
        results = self.mongo_service.find(collection="microservice_endpoints", query=query)

        if not results:
            return {}
        
        return decompress_field(results[0], "payload")

    def fetch_components(self, component_id: str) -> dict:
        try:
            query = {"_id": ObjectId(component_id)}
        except Exception as e:
            print(f"Invalid component ID format provided: {e}")
            return {}
        
        results = self.mongo_service.find(collection="microservice_components", query=query)

        if not results:
            return {}

        document = results[0] 
        
        if "compressedPayload" in document:
            return decompress_field(document, "compressedPayload")
        
        return {}
    
    def fetch_auth_vectors(self, auth_vectors_id: str) -> dict:
        try:
            query = {"_id": ObjectId(auth_vectors_id)}
        except Exception as e:
            print(f"Invalid auth_vectors ID format provided: {e}")
            return {}
        
        results = self.mongo_service.find(collection="auth_vectors", query=query)
        if not results:
            return {}

        document = results[0]
        document["vectors"] = decompress_field(document, "vectors")
        document["_id"] = str(document["_id"])

        return document
    
    def add_scenarios(self, scenarios: list) -> list:
        try:
            self.mongo_service.insert_many(
                collection="generated_scenarios", 
                documents=scenarios
            )

            returned_docs = []
            for doc in scenarios:
                doc_copy = dict(doc)
                if "_id" in doc_copy:
                    doc_copy["_id"] = str(doc_copy["_id"])
                    
                returned_docs.append(doc_copy)
            
            return returned_docs
        except Exception as e:
            print(f"Error inserting scenarios into database: {e}")
            return scenarios
    
    def fetch_scenarios_by_ids(self, scenario_ids: List[str]) -> List[Dict[str, Any]]:
        pipeline = [
            {"$match": {"scenario_id": {"$in": scenario_ids}}},
            {"$sort": {"_id": -1}},
            {
                "$group": {
                    "_id": "$scenario_id",
                    "latest_document": {"$first": "$$ROOT"}
                }
            },
            {"$replaceRoot": {"newRoot": "$latest_document"}}
        ]

        results = self.mongo_service.aggregate(collection="generated_scenarios", pipeline=pipeline)

        if not results:
            print("No scenarios found for the provided IDs.")
            return []

        return list(results)
    
