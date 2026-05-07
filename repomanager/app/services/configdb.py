import os
from cryptography.fernet import Fernet
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

        encryption_key = os.getenv("ENCRYPTION_KEY")
        self.cipher_suite = Fernet(encryption_key.encode('utf-8'))

    async def save_token(self, token: str):
        await self.collection.update_one(
            {"key": "github_token"},
            {"$set": {"value": token}},
            upsert=True
        )

    async def get_token(self) -> str:
        doc = await self.collection.find_one({"key": "github_token"})
        if doc and doc.get("value"):
            plain_token = doc["value"]
            
            if self.cipher_suite:
                encrypted_bytes = self.cipher_suite.encrypt(plain_token.encode('utf-8'))
                return encrypted_bytes.decode('utf-8')
            else:
                return plain_token
        return None

    async def delete_token(self):
        await self.collection.delete_one({"key": "github_token"})

config_db_service = ConfigDatabase()