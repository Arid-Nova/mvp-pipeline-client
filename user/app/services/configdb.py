import os
import base64
import hashlib
from Crypto.Cipher import AES
from motor.motor_asyncio import AsyncIOMotorClient

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
        self.collection = self.db["settings"]

    def _get_aes_key(self):
        raw_key = os.getenv("ENCRYPTION_KEY")
        if not raw_key:
            raw_key = "default_fallback_key"
        return hashlib.sha256(raw_key.encode('utf-8')).digest()
    
    async def save_feedback(self, rating: int, comments: str):
        await self.collection.update_one(
            {"key": "user_feedback"},
            {"$set": {"rating": rating, "comments": comments}},
            upsert=True
        )

config_db_service = ConfigDatabase()