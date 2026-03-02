
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

        if results:
            document = results[0] 
            return document.get("payload", {})
        
        print(f"No endpoint found with ID: {endpoint_id}")
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
            compressed_data = document["compressedPayload"]
            
            try:
                if isinstance(compressed_data, dict) and "$binary" in compressed_data:
                    b64_string = compressed_data["$binary"].get("base64", "")
                    compressed_bytes = base64.b64decode(b64_string)
                    
                elif isinstance(compressed_data, (bytes, bytearray)):
                    compressed_bytes = compressed_data
                    
                elif isinstance(compressed_data, str):
                    compressed_bytes = base64.b64decode(compressed_data)
                    
                else:
                    raise ValueError("Unknown format for compressedPayload")

                decompressed_bytes = gzip.decompress(compressed_bytes)
                
                decompressed_string = decompressed_bytes.decode('utf-8')
                return json.loads(decompressed_string)
                
            except Exception as e:
                print(f"Error decompressing payload for component {component_id}: {e}")
                return {}
        
        return {}
    
    def add_auth_vectors(self, collection: str, data: dict) -> str:
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