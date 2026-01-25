"""
Video processing router for ffmpeg-based operations.
"""
import base64
import tempfile
import subprocess
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from app.auth import get_current_user
from app.logging_config import setup_logger

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/video", tags=["video-processing"])


class MergeVideosRequest(BaseModel):
    videos_base64: List[str] = Field(..., description="List of base64 encoded videos to merge")


class MergeVideosResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


class AddMusicRequest(BaseModel):
    video_base64: str = Field(..., description="Base64 encoded video")
    audio_base64: str = Field(..., description="Base64 encoded audio")
    music_volume: int = Field(default=50, description="Music volume 0-100")
    original_volume: int = Field(default=100, description="Original audio volume 0-100")


class AddMusicResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


def clean_base64(b64_string: str) -> bytes:
    """Clean base64 string and decode to bytes."""
    # Remove data URL prefix if present
    if b64_string.startswith("data:"):
        comma_idx = b64_string.find(",")
        if comma_idx != -1:
            b64_string = b64_string[comma_idx + 1:]

    # Remove whitespace
    b64_string = b64_string.strip().replace("\n", "").replace("\r", "").replace(" ", "")

    # Fix padding
    padding_needed = len(b64_string) % 4
    if padding_needed:
        b64_string += "=" * (4 - padding_needed)

    return base64.b64decode(b64_string)


@router.post("/merge", response_model=MergeVideosResponse)
async def merge_videos(
    request: MergeVideosRequest,
    user: dict = Depends(get_current_user)
):
    """
    Merge multiple videos into one using ffmpeg concat.
    """
    try:
        logger.info(f"Merge videos request from user {user['email']}, count={len(request.videos_base64)}")

        if len(request.videos_base64) < 2:
            raise HTTPException(status_code=400, detail="At least 2 videos required")

        if len(request.videos_base64) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 videos allowed")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save all input videos
            video_paths = []
            for i, video_b64 in enumerate(request.videos_base64):
                video_bytes = clean_base64(video_b64)
                video_path = os.path.join(tmpdir, f"input_{i}.mp4")
                with open(video_path, "wb") as f:
                    f.write(video_bytes)
                video_paths.append(video_path)
                logger.info(f"Saved video {i}: {len(video_bytes)} bytes")

            # Create concat file for ffmpeg
            concat_file = os.path.join(tmpdir, "concat.txt")
            with open(concat_file, "w") as f:
                for path in video_paths:
                    f.write(f"file '{path}'\n")

            # Merge videos using ffmpeg concat demuxer with re-encoding
            # Re-encoding ensures compatibility between different video sources
            output_path = os.path.join(tmpdir, "output.mp4")
            merge_cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg merge: {' '.join(merge_cmd)}")
            result = subprocess.run(merge_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                logger.error(f"ffmpeg merge failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to merge videos: {result.stderr[:200]}")

            # Read output and return
            with open(output_path, "rb") as f:
                output_bytes = f.read()

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")
            logger.info(f"Merge complete: {len(output_bytes)} bytes")

            return MergeVideosResponse(
                video_base64=output_base64,
                mime_type="video/mp4"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Merge videos failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add-music", response_model=AddMusicResponse)
async def add_music_to_video(
    request: AddMusicRequest,
    user: dict = Depends(get_current_user)
):
    """
    Add/mix music into a video using ffmpeg.
    """
    try:
        logger.info(f"Add music request from user {user['email']}, music_vol={request.music_volume}, orig_vol={request.original_volume}")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save input video
            video_bytes = clean_base64(request.video_base64)
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(video_bytes)
            logger.info(f"Saved video: {len(video_bytes)} bytes")

            # Save input audio
            audio_bytes = clean_base64(request.audio_base64)
            audio_path = os.path.join(tmpdir, "music.mp3")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)
            logger.info(f"Saved audio: {len(audio_bytes)} bytes")

            # Calculate volume multipliers (0-1 scale)
            music_vol = request.music_volume / 100.0
            orig_vol = request.original_volume / 100.0

            # Mix audio using ffmpeg
            output_path = os.path.join(tmpdir, "output.mp4")

            # Complex filter to mix audio streams
            # -filter_complex mixes the original audio with the music
            filter_complex = (
                f"[0:a]volume={orig_vol}[a0];"
                f"[1:a]volume={music_vol}[a1];"
                f"[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            )

            mix_cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", audio_path,
                "-filter_complex", filter_complex,
                "-map", "0:v",  # Video from first input
                "-map", "[aout]",  # Mixed audio
                "-c:v", "copy",  # Copy video without re-encoding
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",  # Cut to shortest stream
                output_path
            ]

            logger.info(f"Running ffmpeg mix")
            result = subprocess.run(mix_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                logger.error(f"ffmpeg mix failed: {result.stderr}")
                # Try simpler approach - just replace audio
                simple_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-c:v", "copy",
                    "-map", "0:v",
                    "-map", "1:a",
                    "-shortest",
                    output_path
                ]
                result = subprocess.run(simple_cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    raise HTTPException(status_code=500, detail="Failed to add music to video")

            # Read output and return
            with open(output_path, "rb") as f:
                output_bytes = f.read()

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")
            logger.info(f"Add music complete: {len(output_bytes)} bytes")

            return AddMusicResponse(
                video_base64=output_base64,
                mime_type="video/mp4"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add music failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
