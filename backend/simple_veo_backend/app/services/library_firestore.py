"""
Library service using Firestore for metadata and GCS for file storage
"""
import asyncio
import uuid
import base64
from datetime import datetime
from typing import Optional
from google.cloud import storage
from app.firestore import get_firestore_client, ASSETS_COLLECTION
from app.config import settings
from app.schemas import AssetResponse, LibraryResponse
from app.logging_config import setup_logger
from app.exceptions import AssetNotFoundError, AccessDeniedError, InvalidAssetTypeError

logger = setup_logger(__name__)


async def run_sync(func, *args, **kwargs):
    """Run a blocking function in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


class LibraryServiceFirestore:
    """
    Library service backed by Firestore for metadata and GCS for file storage.
    
    Firestore Schema:
    /assets/{asset_id}
        - id: string
        - user_id: string (indexed)
        - asset_type: "image" | "video" (indexed)
        - blob_path: string
        - mime_type: string
        - created_at: datetime (indexed)
        - prompt: string (optional)
        - source: "upload" | "generated"
        - workflow_id: string (optional - which workflow created it)
    """
    
    def __init__(self, gcs_client: Optional[storage.Client] = None):
        self.db = get_firestore_client()
        self.assets_ref = self.db.collection(ASSETS_COLLECTION)
        self.storage_client = gcs_client or storage.Client()
        self.bucket = self.storage_client.bucket(settings.gcs_bucket)
    
    def _generate_asset_id(self) -> str:
        return str(uuid.uuid4())
    
    def _strip_base64_prefix(self, data: str) -> str:
        """Remove data URL prefix if present"""
        if data and ',' in data and data.startswith('data:'):
            return data.split(',', 1)[1]
        return data
    
    def _get_url(self, blob_path: str) -> str:
        """Generate public URL for a blob"""
        return f"https://storage.googleapis.com/{settings.gcs_bucket}/{blob_path}"

    async def save_asset(
        self,
        data: str,
        asset_type: str,
        user_id: str,
        prompt: Optional[str] = None,
        mime_type: Optional[str] = None,
        source: str = "generated",
        workflow_id: Optional[str] = None
    ) -> AssetResponse:
        """Save an image or video to the asset library"""
        asset_id = self._generate_asset_id()
        now = datetime.utcnow()
        
        logger.info(f"Saving {asset_type} asset for user {user_id}")
        
        # Determine file extension and mime type
        if asset_type == "image":
            ext = "png" if not mime_type or "png" in mime_type else "jpg"
            mime_type = mime_type or "image/png"
        elif asset_type == "video":
            ext = "mp4"
            mime_type = mime_type or "video/mp4"
        else:
            raise InvalidAssetTypeError(asset_type)
        
        # Create blob path
        blob_path = f"users/{user_id}/{asset_type}s/{asset_id}.{ext}"
        
        # Decode and upload to GCS (non-blocking)
        clean_data = self._strip_base64_prefix(data)
        file_bytes = base64.b64decode(clean_data)

        blob = self.bucket.blob(blob_path)
        await run_sync(blob.upload_from_string, file_bytes, content_type=mime_type)

        # Save metadata to Firestore (non-blocking)
        asset_data = {
            "id": asset_id,
            "user_id": user_id,
            "asset_type": asset_type,
            "blob_path": blob_path,
            "mime_type": mime_type,
            "created_at": now,
            "prompt": prompt,
            "source": source,
            "workflow_id": workflow_id
        }

        await run_sync(self.assets_ref.document(asset_id).set, asset_data)
        
        logger.info(f"Successfully saved {asset_type} asset {asset_id} to {blob_path}")
        
        url = self._get_url(blob_path)
        
        return AssetResponse(
            id=asset_id,
            url=url,
            asset_type=asset_type,
            prompt=prompt,
            created_at=now.isoformat() + "Z",
            mime_type=mime_type,
            user_id=user_id
        )

    async def list_assets(
        self,
        user_id: str,
        asset_type: Optional[str] = None,
        limit: int = 50
    ) -> LibraryResponse:
        """List assets for a user"""
        from google.cloud.firestore_v1.base_query import FieldFilter

        # Query by user_id
        query = self.assets_ref.where(filter=FieldFilter("user_id", "==", user_id))

        # Filter by type if specified
        if asset_type:
            query = query.where(filter=FieldFilter("asset_type", "==", asset_type))

        # Order by created_at descending and limit
        query = query.order_by("created_at", direction="DESCENDING").limit(limit)

        # Run blocking stream() in thread pool
        docs = await run_sync(lambda: list(query.stream()))

        assets = []
        for doc in docs:
            data = doc.to_dict()
            url = self._get_url(data["blob_path"])
            created_at = data["created_at"]

            assets.append(AssetResponse(
                id=data["id"],
                url=url,
                asset_type=data["asset_type"],
                prompt=data.get("prompt"),
                created_at=created_at.isoformat() + "Z" if hasattr(created_at, 'isoformat') else created_at,
                mime_type=data["mime_type"],
                user_id=data["user_id"]
            ))

        return LibraryResponse(assets=assets, count=len(assets))

    async def get_asset(self, asset_id: str, user_id: str) -> AssetResponse:
        """Get a specific asset by ID"""
        doc = await run_sync(self.assets_ref.document(asset_id).get)

        if not doc.exists:
            raise AssetNotFoundError(asset_id)

        data = doc.to_dict()

        # Check ownership
        if data.get("user_id") != user_id:
            raise AccessDeniedError()

        url = self._get_url(data["blob_path"])
        created_at = data["created_at"]

        return AssetResponse(
            id=data["id"],
            url=url,
            asset_type=data["asset_type"],
            prompt=data.get("prompt"),
            created_at=created_at.isoformat() + "Z" if hasattr(created_at, 'isoformat') else created_at,
            mime_type=data["mime_type"],
            user_id=data["user_id"]
        )

    async def get_asset_by_id(self, asset_id: str) -> Optional[dict]:
        """
        Get asset by ID without ownership check.
        Used for resolving asset refs in workflows (including public workflows).
        """
        doc = await run_sync(self.assets_ref.document(asset_id).get)

        if not doc.exists:
            return None

        data = doc.to_dict()
        url = self._get_url(data["blob_path"])

        return {
            "id": data["id"],
            "url": url,
            "asset_type": data["asset_type"],
            "mime_type": data["mime_type"],
            "exists": True
        }

    async def resolve_asset_urls(self, asset_ids: list[str]) -> dict[str, dict]:
        """
        Batch resolve multiple asset IDs to URLs.
        Returns dict mapping asset_id to {url, exists, asset_type, mime_type}

        Uses Firestore's get_all() for batch fetching to avoid N+1 queries.
        """
        if not asset_ids:
            return {}

        result = {}

        try:
            # Batch fetch all assets in a single Firestore round trip (non-blocking)
            doc_refs = [self.assets_ref.document(asset_id) for asset_id in asset_ids]
            docs = await run_sync(lambda: list(self.db.get_all(doc_refs)))

            for doc in docs:
                asset_id = doc.id
                if doc.exists:
                    data = doc.to_dict()
                    result[asset_id] = {
                        "url": self._get_url(data["blob_path"]),
                        "exists": True,
                        "asset_type": data["asset_type"],
                        "mime_type": data["mime_type"]
                    }
                else:
                    result[asset_id] = {"url": None, "exists": False}
        except Exception as e:
            logger.warning(f"Batch asset fetch failed: {e}, falling back to individual queries")
            # Fallback to individual queries if batch fails
            for asset_id in asset_ids:
                try:
                    doc = await run_sync(self.assets_ref.document(asset_id).get)
                    if doc.exists:
                        data = doc.to_dict()
                        result[asset_id] = {
                            "url": self._get_url(data["blob_path"]),
                            "exists": True,
                            "asset_type": data["asset_type"],
                            "mime_type": data["mime_type"]
                        }
                    else:
                        result[asset_id] = {"url": None, "exists": False}
                except Exception as inner_e:
                    logger.warning(f"Failed to resolve asset {asset_id}: {inner_e}")
                    result[asset_id] = {"url": None, "exists": False}

        return result

    async def delete_asset(self, asset_id: str, user_id: str) -> dict:
        """Delete an asset"""
        doc_ref = self.assets_ref.document(asset_id)
        doc = await run_sync(doc_ref.get)

        if not doc.exists:
            raise AssetNotFoundError(asset_id)

        data = doc.to_dict()

        # Check ownership
        if data.get("user_id") != user_id:
            raise AccessDeniedError("You can only delete your own assets")

        # Delete asset file from GCS (non-blocking)
        try:
            blob = self.bucket.blob(data["blob_path"])
            exists = await run_sync(blob.exists)
            if exists:
                await run_sync(blob.delete)
        except Exception as e:
            logger.warning(f"Failed to delete blob {data['blob_path']}: {e}")

        # Delete metadata from Firestore (non-blocking)
        await run_sync(doc_ref.delete)

        logger.info(f"Deleted asset {asset_id} for user {user_id}")

        return {"status": "deleted", "id": asset_id}
