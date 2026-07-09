import os
import base64
import hashlib
from Crypto.Cipher import AES
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError

class ConfigDatabase:
    def __init__(self, uri=None, db_name=None, username=None, password=None, auth_source=None):
        self.uri = uri or os.getenv("MONGO_URI", "mongodb://cloudhub_mongo:27017")
        self.db_name = db_name or os.getenv("MONGO_DB")
        self.username = username or os.getenv("MONGO_USER")
        self.password = password or os.getenv("MONGO_PASSWORD")
        self.auth_source = auth_source or os.getenv("MONGO_AUTH_SOURCE", "admin")
        
        client_options = {"host": self.uri}
        if self.username and self.password:
            client_options.update({
                "username": self.username,
                "password": self.password,
                "authSource": self.auth_source
            })

        self.client = AsyncIOMotorClient(**client_options)
        self.db = self.client[self.db_name]
        self.collection = self.db["settings"]

    def _get_aes_key(self):
        raw_key = os.getenv("ENCRYPTION_KEY")
        if not raw_key:
            raw_key = "default_fallback_key"
        return hashlib.sha256(raw_key.encode('utf-8')).digest()
    
    async def save_token(self, token: str):
        aes_key = self._get_aes_key()
        cipher = AES.new(aes_key, AES.MODE_EAX)
        ciphertext, tag = cipher.encrypt_and_digest(token.encode('utf-8'))
        encrypted_payload = base64.b64encode(cipher.nonce + tag + ciphertext).decode('utf-8')

        await self.collection.update_one(
            {"key": "github_token"},
            {"$set": {"value": encrypted_payload}},
            upsert=True
        )

    async def get_token(self) -> str:
        try:
            doc = await self.collection.find_one({"key": "github_token"})
        except PyMongoError as e:
            print(f"Failed to read GitHub token from MongoDB: {e}", flush=True)
            return None

        if not doc or not doc.get("value"):
            return None

        try:
            encrypted_payload = base64.b64decode(doc["value"])

            nonce = encrypted_payload[:16]
            tag = encrypted_payload[16:32]
            ciphertext = encrypted_payload[32:]
            
            aes_key = self._get_aes_key()
            cipher = AES.new(aes_key, AES.MODE_EAX, nonce=nonce)
            
            # Decrypt back to plain text string
            decrypted_token = cipher.decrypt_and_verify(ciphertext, tag)
            return decrypted_token.decode('utf-8')
            
        except Exception as e:
            print(f"Failed to decryption: {e}", flush=True)
            return None

    async def delete_token(self):
        await self.collection.delete_one({"key": "github_token"})

config_db_service = ConfigDatabase()
