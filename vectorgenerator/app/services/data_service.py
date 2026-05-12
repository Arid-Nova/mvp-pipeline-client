
from ..utils.decompress import decompress_mongo_payload

from ..models.generateoutputdata import GeneratedOutputData
from ..models.generateallrequest import GenerateAllRequest

from .mongo_service import MongoService

from bson.objectid import ObjectId
import base64
import gzip
import json
import os

class DataService:
    def __init__(self, uri: str = None, db_name: str = None, username: str = None, password: str = None):
        
        uri = uri or os.getenv("MONGO_URI", "mongodb://localhost:27017/")
        db_name = db_name or os.getenv("MONGO_DB", "aegis")
        username = username or os.getenv("MONGO_USER", "root")
        password = password or os.getenv("MONGO_PASSWORD")
        
        self.mongo_service = MongoService(
            uri=uri,
            db_name=db_name,
            username=username,
            password=password,
        )

    def fetch_index_data(self, request: GenerateAllRequest):
        response = self.fetch_endpoint_component_indexes(request.indexId)

        request.components = self.fetch_components(response.get("componentId"))
        request.endpoints = self.fetch_endpoints(response.get("endpointId"))

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

        try:
            return decompress_mongo_payload(results[0], "payload")
        except Exception as e:
            print(f"Error parsing endpoints: {e}")
            return {}

    def fetch_components(self, component_id: str) -> dict:
        try:
            query = {"_id": ObjectId(component_id)}
        except Exception as e:
            print(f"Invalid component ID format provided: {e}")
            return {}
        
        results = self.mongo_service.find(collection="microservice_components", query=query)

        if not results:
            print(f"No component found with ID: {component_id}")
            return {}

        document = results[0] 
        
        if "compressedPayload" in document:
            try:
                return decompress_mongo_payload(document, "compressedPayload")
            except Exception as e:
                print(f"Error parsing components: {e}")

        return {}
    
    def add_auth_vectors(self, collection: str, data: dict) -> str:
        if "vectors" in data and isinstance(data["vectors"], dict):
            try:
                vectors_json = json.dumps(data["vectors"]).encode('utf-8')
                compressed_vectors = gzip.compress(vectors_json)
                data["vectors"] = compressed_vectors
                
            except Exception as e:
                print(f"Error compressing auth vectors: {e}")

        return self.mongo_service.insert(collection=collection, data=data)
    
    def fetch_vector_data (self, request: GeneratedOutputData):
        try:
            query = {"_id": ObjectId(request.id)}
        except Exception as e:
            print(f"Invalid ID format provided: {e}")
            return 

        results = self.mongo_service.find(collection="auth_vectors", query=query)

        if not results:
            print(f"No vector data found with ID: {request.id}")
            return 

        document = results[0] 
        request.metadata = document.get("metadata", {})
        request.vectors = document.get("vectors", {})