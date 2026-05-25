import os
import base64

import hashlib
from Crypto.Cipher import AES
from motor.motor_asyncio import AsyncIOMotorClient

from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timezone

class ConfigDatabase:
    def __init__(self, uri=None, db_name=None, username=None, password=None):
        self.uri = uri or os.getenv("MONGO_URI", "mongodb://cloudhub_mongo:27017")
        self.db_name = db_name or os.getenv("MONGO_DB")
        self.username = username or os.getenv("MONGO_USER")
        self.password = password or os.getenv("MONGO_PASSWORD")
        
        self.client = AsyncIOMotorClient(
            host=self.uri,
            username=self.username,
            password=self.password
        )
        self.db = self.client[self.db_name]
        self.feedback_collection = self.db["user_feedback"]
        self.session_collection = self.db["user_session"]

    # Common utilities
    def _get_aes_key(self):
        raw_key = os.getenv("ENCRYPTION_KEY")
        if not raw_key:
            raw_key = "default_fallback_key"
        return hashlib.sha256(raw_key.encode('utf-8')).digest()
    
    # Temporary feedback related functions
    async def save_feedback(self, rating: int, comments: str):
        await self.feedback_collection.insert_one(
            {"rating": rating, "comments": comments}
        )

    # User session management functions
    async def save_new_session(self, browser: str, screen_resolution: str, ip_address: str):
        session_document = {
            "browser": browser,
            "screen_resolution": screen_resolution,
            "ip_address": ip_address,
            "start_datetime": datetime.now(timezone.utc) 
        }
        
        result = await self.session_collection.insert_one(session_document)
        return str(result.inserted_id)
    
    async def end_session(self, session_id: str):
        try:
            mongo_session_id = ObjectId(session_id)
            session = await self.session_collection.find_one({"_id": mongo_session_id})
            if not session:
                return False
            
            start_datetime = session.get("start_datetime")
            end_datetime = datetime.now(timezone.utc)
            time_spent_seconds = None

            if start_datetime:
                if start_datetime.tzinfo is None:
                    start_datetime = start_datetime.replace(tzinfo=timezone.utc)
                
                time_spent_seconds = round((end_datetime - start_datetime).total_seconds(), 2)

            result = await self.session_collection.update_one(
                {"_id": mongo_session_id},
                {"$set": {
                    "end_datetime": datetime.now(timezone.utc),
                    "time_spent_seconds": time_spent_seconds
                }}
            )
            
            return result.matched_count > 0           
        except InvalidId:
            return False
    
    async def has_ended_sessions(self) -> bool:
        query = {"end_datetime": {"$exists": True, "$ne": None}}
        count = await self.session_collection.count_documents(query, limit=1)
        return count > 0

config_db_service = ConfigDatabase()