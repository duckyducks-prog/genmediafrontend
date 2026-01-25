"""
ElevenLabs API router for voice-related functionality.
"""
import base64
import tempfile
import subprocess
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from app.auth import get_current_user
from app.config import settings
from app.logging_config import setup_logger
from app.exceptions import AppError

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/elevenlabs", tags=["elevenlabs"])

# ElevenLabs API base URL
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    preview_url: Optional[str] = None
    labels: Optional[dict] = None


class VoicesResponse(BaseModel):
    voices: List[VoiceInfo]


class VoiceChangeRequest(BaseModel):
    video_base64: str = Field(..., description="Base64 encoded video file")
    voice_id: str = Field(..., description="ElevenLabs voice ID to use")


class VoiceChangeResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


def get_elevenlabs_headers() -> dict:
    """Get headers for ElevenLabs API requests."""
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ElevenLabs API key not configured")
    return {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }


@router.get("/voices", response_model=VoicesResponse)
async def list_voices(user: dict = Depends(get_current_user)):
    """List all available ElevenLabs voices."""
    try:
        logger.info(f"Fetching ElevenLabs voices for user {user['email']}")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{ELEVENLABS_API_BASE}/voices",
                headers=get_elevenlabs_headers(),
            )

            if response.status_code != 200:
                logger.error(f"ElevenLabs API error: {response.status_code} - {response.text[:500]}")
                raise HTTPException(status_code=502, detail=f"ElevenLabs API error: {response.status_code}")

            data = response.json()
            voices = []

            for voice in data.get("voices", []):
                voices.append(VoiceInfo(
                    voice_id=voice.get("voice_id"),
                    name=voice.get("name"),
                    preview_url=voice.get("preview_url"),
                    labels=voice.get("labels"),
                ))

            logger.info(f"Found {len(voices)} voices")
            return VoicesResponse(voices=voices)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch voices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-change", response_model=VoiceChangeResponse)
async def change_voice(
    request: VoiceChangeRequest,
    user: dict = Depends(get_current_user)
):
    """
    Change the voice in a video using ElevenLabs Speech-to-Speech.

    Process:
    1. Decode video from base64
    2. Extract audio from video using ffmpeg
    3. Send audio to ElevenLabs Speech-to-Speech API
    4. Merge new audio back into video using ffmpeg
    5. Return new video as base64
    """
    try:
        logger.info(f"Voice change request from user {user['email']}, voice_id={request.voice_id}")

        # Create temp directory for processing
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. Save input video
            input_video_path = os.path.join(tmpdir, "input.mp4")
            video_bytes = base64.b64decode(request.video_base64)
            with open(input_video_path, "wb") as f:
                f.write(video_bytes)

            logger.info(f"Saved input video: {len(video_bytes)} bytes")

            # 2. Extract audio from video using ffmpeg
            extracted_audio_path = os.path.join(tmpdir, "extracted.mp3")
            extract_cmd = [
                "ffmpeg", "-y",
                "-i", input_video_path,
                "-vn",  # No video
                "-acodec", "libmp3lame",
                "-ar", "44100",
                "-ac", "1",  # Mono for better voice processing
                "-b:a", "128k",
                extracted_audio_path
            ]

            result = subprocess.run(extract_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg extract failed: {result.stderr}")
                raise HTTPException(status_code=500, detail="Failed to extract audio from video")

            logger.info("Extracted audio from video")

            # 3. Send audio to ElevenLabs Speech-to-Speech API
            with open(extracted_audio_path, "rb") as f:
                audio_data = f.read()

            async with httpx.AsyncClient(timeout=120.0) as client:
                # ElevenLabs Speech-to-Speech endpoint
                sts_url = f"{ELEVENLABS_API_BASE}/speech-to-speech/{request.voice_id}"

                # Prepare multipart form data
                files = {
                    "audio": ("audio.mp3", audio_data, "audio/mpeg"),
                }
                data = {
                    "model_id": "eleven_english_sts_v2",
                    "voice_settings": '{"stability": 0.5, "similarity_boost": 0.75}',
                }

                headers = {"xi-api-key": settings.elevenlabs_api_key}

                response = await client.post(
                    sts_url,
                    files=files,
                    data=data,
                    headers=headers,
                )

                if response.status_code != 200:
                    logger.error(f"ElevenLabs STS error: {response.status_code} - {response.text[:500]}")
                    raise HTTPException(
                        status_code=502,
                        detail=f"ElevenLabs voice conversion failed: {response.status_code}"
                    )

                # Save the converted audio
                converted_audio_path = os.path.join(tmpdir, "converted.mp3")
                with open(converted_audio_path, "wb") as f:
                    f.write(response.content)

                logger.info(f"Received converted audio: {len(response.content)} bytes")

            # 4. Merge new audio back into video using ffmpeg
            output_video_path = os.path.join(tmpdir, "output.mp4")
            merge_cmd = [
                "ffmpeg", "-y",
                "-i", input_video_path,
                "-i", converted_audio_path,
                "-c:v", "copy",  # Copy video stream without re-encoding
                "-map", "0:v:0",  # Use video from first input
                "-map", "1:a:0",  # Use audio from second input
                "-shortest",  # Cut to shortest stream
                output_video_path
            ]

            result = subprocess.run(merge_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg merge failed: {result.stderr}")
                raise HTTPException(status_code=500, detail="Failed to merge audio with video")

            logger.info("Merged converted audio with video")

            # 5. Read output video and return as base64
            with open(output_video_path, "rb") as f:
                output_bytes = f.read()

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")

            logger.info(f"Voice change complete: {len(output_bytes)} bytes output")

            return VoiceChangeResponse(
                video_base64=output_base64,
                mime_type="video/mp4"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice change failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
