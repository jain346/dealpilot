"""
Google Cloud Storage Persistence Bridge for DealPilot.

When running on Google Cloud Run (a stateless container environment),
this module automatically syncs the SQLite database with a designated
GCS bucket on startup, in the background, and on shutdown.
"""

import asyncio
import os
from pathlib import Path
from logging_config import logger

GCS_BUCKET_NAME = os.environ.get("DEALPILOT_GCS_BUCKET", "").strip()
_last_synced_mtime = 0.0
_sync_lock = asyncio.Lock()


def download_db_from_gcs(db_path: Path) -> bool:
    """Download the persistent database from GCS bucket on startup."""
    if not GCS_BUCKET_NAME:
        return False

    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob("dealpilot.db")

        if blob.exists():
            logger.info(
                f"[GCS Persistence] Downloading existing database from gs://{GCS_BUCKET_NAME}/dealpilot.db to {db_path}..."
            )
            db_path.parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(str(db_path))
            global _last_synced_mtime
            _last_synced_mtime = db_path.stat().st_mtime
            logger.info("[GCS Persistence] Database successfully restored from Cloud Storage.")
            return True
        else:
            logger.info(
                f"[GCS Persistence] No database found in gs://{GCS_BUCKET_NAME}/dealpilot.db. Starting with fresh/local database."
            )
    except Exception as e:
        logger.warning(f"[GCS Persistence] Could not download database from GCS: {e}")

    return False


def upload_db_to_gcs(db_path: Path, force: bool = False) -> bool:
    """Upload the local SQLite database to GCS bucket if it has been modified."""
    if not GCS_BUCKET_NAME or not db_path.exists():
        return False

    global _last_synced_mtime
    try:
        current_mtime = db_path.stat().st_mtime
        if not force and current_mtime <= _last_synced_mtime:
            return False

        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob("dealpilot.db")
        blob.upload_from_filename(str(db_path))
        _last_synced_mtime = current_mtime
        logger.info(f"[GCS Persistence] Database state synced to gs://{GCS_BUCKET_NAME}/dealpilot.db")
        return True
    except Exception as e:
        logger.warning(f"[GCS Persistence] Failed to upload database to GCS: {e}")
        return False


async def start_gcs_sync_loop(db_path: Path, interval_seconds: int = 5):
    """Background async loop that monitors database file changes and uploads to GCS."""
    if not GCS_BUCKET_NAME:
        return

    logger.info(f"[GCS Persistence] Active sync loop watching {db_path} every {interval_seconds}s...")
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            async with _sync_lock:
                await asyncio.to_thread(upload_db_to_gcs, db_path)
        except asyncio.CancelledError:
            # Upload final state upon shutdown
            async with _sync_lock:
                await asyncio.to_thread(upload_db_to_gcs, db_path, force=True)
            break
        except Exception as e:
            logger.error(f"[GCS Persistence] Error in background sync loop: {e}")
