"""
Video processing router for ffmpeg-based operations.
"""
import base64
import tempfile
import subprocess
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List
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


def run_ffmpeg(cmd: List[str], error_msg: str) -> subprocess.CompletedProcess:
    """Run ffmpeg command with proper error handling."""
    # Always add -hide_banner to suppress version info
    if "-hide_banner" not in cmd:
        cmd.insert(1, "-hide_banner")

    logger.info(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        # Get the actual error, not version info
        stderr = result.stderr
        # Find actual error after the configuration line
        if "configuration:" in stderr:
            parts = stderr.split("\n")
            # Skip header lines, get actual error
            error_lines = [l for l in parts if l.strip() and not l.startswith(" ") and "version" not in l.lower() and "built with" not in l.lower() and "configuration:" not in l.lower() and "lib" not in l.lower()]
            stderr = "\n".join(error_lines[-5:]) if error_lines else stderr[-500:]
        logger.error(f"ffmpeg failed: {stderr}")
        raise HTTPException(status_code=500, detail=f"{error_msg}: {stderr[:300]}")

    return result


@router.post("/merge", response_model=MergeVideosResponse)
async def merge_videos(
    request: MergeVideosRequest,
    user: dict = Depends(get_current_user)
):
    """
    Merge multiple videos into one using ffmpeg concat filter.
    Uses re-encoding for compatibility between different video sources.
    """
    try:
        num_videos = len(request.videos_base64)
        logger.info(f"Merge videos request from user {user['email']}, count={num_videos}")

        if num_videos < 2:
            raise HTTPException(status_code=400, detail="At least 2 videos required")

        if num_videos > 10:
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

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build the concat filter command
            # This method re-encodes and handles different codecs/resolutions
            # Format: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[outv][outa]

            inputs = []
            filter_inputs = []

            for i, path in enumerate(video_paths):
                inputs.extend(["-i", path])
                filter_inputs.append(f"[{i}:v]")
                filter_inputs.append(f"[{i}:a]")

            # Build filter: scale all to same size, then concat
            filter_complex = (
                f"{''.join(filter_inputs)}concat=n={num_videos}:v=1:a=1[outv][outa]"
            )

            merge_cmd = [
                "ffmpeg", "-y",
                *inputs,
                "-filter_complex", filter_complex,
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-vsync", "vfr",
                output_path
            ]

            run_ffmpeg(merge_cmd, "Failed to merge videos")

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
    Handles videos with or without existing audio.
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

            # Save input audio - detect format from header
            audio_bytes = clean_base64(request.audio_base64)

            # Detect audio format from magic bytes
            audio_ext = "mp3"
            if audio_bytes[:4] == b'RIFF':
                audio_ext = "wav"
            elif audio_bytes[:3] == b'ID3' or (len(audio_bytes) > 1 and audio_bytes[0:2] == b'\xff\xfb'):
                audio_ext = "mp3"
            elif audio_bytes[:4] == b'fLaC':
                audio_ext = "flac"
            elif audio_bytes[:4] == b'OggS':
                audio_ext = "ogg"

            audio_path = os.path.join(tmpdir, f"music.{audio_ext}")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)
            logger.info(f"Saved audio: {len(audio_bytes)} bytes, format: {audio_ext}")

            # Calculate volume multipliers (0-1 scale)
            music_vol = request.music_volume / 100.0
            orig_vol = request.original_volume / 100.0

            output_path = os.path.join(tmpdir, "output.mp4")

            # First, check if video has audio stream
            probe_cmd = [
                "ffprobe", "-v", "error",
                "-select_streams", "a",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                video_path
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            has_audio = bool(probe_result.stdout.strip())
            logger.info(f"Video has audio: {has_audio}")

            if has_audio and orig_vol > 0:
                # Mix original audio with music using amix
                # [1:a] = music, adjust volume, pad to match video length
                # [0:a] = original audio, adjust volume
                # amerge combines them
                filter_complex = (
                    f"[0:a]volume={orig_vol}[orig];"
                    f"[1:a]volume={music_vol}[music];"
                    f"[orig][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"
                )

                mix_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-filter_complex", filter_complex,
                    "-map", "0:v",
                    "-map", "[aout]",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    output_path
                ]
            else:
                # No original audio - just add music track with volume adjustment
                filter_complex = f"[1:a]volume={music_vol}[aout]"

                mix_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-filter_complex", filter_complex,
                    "-map", "0:v",
                    "-map", "[aout]",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    output_path
                ]

            try:
                run_ffmpeg(mix_cmd, "Failed to mix audio")
            except HTTPException:
                # Fallback: just add music without mixing (replace any existing audio)
                logger.warning("Mix failed, trying simple audio replacement")
                simple_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    output_path
                ]
                run_ffmpeg(simple_cmd, "Failed to add music")

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
