"""
ElevenLabs API router for voice-related functionality.
"""
import base64
import tempfile
import subprocess
import os
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from elevenlabs import ElevenLabs
from app.auth import get_current_user
from app.config import settings
from app.logging_config import setup_logger

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/elevenlabs", tags=["elevenlabs"])


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


class GenerateMusicRequest(BaseModel):
    prompt: str = Field(..., description="Music description prompt")
    duration_seconds: Optional[int] = Field(default=None, description="Duration in seconds (30-300). None for auto.")


class GenerateMusicResponse(BaseModel):
    audio_base64: str
    mime_type: str = "audio/mpeg"
    duration_seconds: Optional[int] = None


def get_elevenlabs_client() -> ElevenLabs:
    """Get ElevenLabs client instance."""
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ElevenLabs API key not configured")
    return ElevenLabs(api_key=settings.elevenlabs_api_key)


@router.get("/voices", response_model=VoicesResponse)
async def list_voices(user: dict = Depends(get_current_user)):
    """List all available ElevenLabs voices."""
    try:
        logger.info(f"Fetching ElevenLabs voices for user {user['email']}")

        client = get_elevenlabs_client()
        response = client.voices.get_all()

        voices = []
        for voice in response.voices:
            voices.append(VoiceInfo(
                voice_id=voice.voice_id,
                name=voice.name,
                preview_url=voice.preview_url,
                labels=voice.labels,
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
    2. Send video directly to ElevenLabs STS API (it extracts audio)
    3. Merge new audio back into video using ffmpeg
    4. Return new video as base64
    """
    try:
        logger.info(f"Voice change request from user {user['email']}, voice_id={request.voice_id}")

        # Create temp directory for processing
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. Decode and save input video
            input_video_path = os.path.join(tmpdir, "input.mp4")

            # Clean up base64 string
            video_b64 = request.video_base64

            # Remove data URL prefix if present
            if video_b64.startswith("data:"):
                comma_idx = video_b64.find(",")
                if comma_idx != -1:
                    video_b64 = video_b64[comma_idx + 1:]

            # Remove any whitespace/newlines
            video_b64 = video_b64.strip().replace("\n", "").replace("\r", "").replace(" ", "")

            # Fix base64 padding if needed
            padding_needed = len(video_b64) % 4
            if padding_needed:
                video_b64 += "=" * (4 - padding_needed)

            video_bytes = base64.b64decode(video_b64)

            # Log first bytes to verify it's a valid video
            header_hex = video_bytes[:12].hex() if len(video_bytes) > 12 else video_bytes.hex()
            logger.info(f"Video header (hex): {header_hex}, total size: {len(video_bytes)} bytes")

            with open(input_video_path, "wb") as f:
                f.write(video_bytes)

            logger.info(f"Saved input video: {len(video_bytes)} bytes")

            # 2. Send video to ElevenLabs using official SDK
            client = get_elevenlabs_client()

            logger.info(f"Sending to ElevenLabs STS, voice_id={request.voice_id}")

            # Use the official SDK - it handles file upload correctly
            audio_generator = client.speech_to_speech.convert(
                voice_id=request.voice_id,
                audio=video_bytes,  # SDK accepts bytes directly
                model_id="eleven_multilingual_sts_v2",
                output_format="mp3_44100_128",
            )

            # Collect audio bytes from generator
            converted_audio = b"".join(audio_generator)

            logger.info(f"Received converted audio: {len(converted_audio)} bytes")

            # Save converted audio
            converted_audio_path = os.path.join(tmpdir, "converted.mp3")
            with open(converted_audio_path, "wb") as f:
                f.write(converted_audio)

            # 3. Merge new audio back into video using ffmpeg
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

            # 4. Read output video and return as base64
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


@router.post("/generate-music", response_model=GenerateMusicResponse)
async def generate_music(
    request: GenerateMusicRequest,
    user: dict = Depends(get_current_user)
):
    """
    Generate music using ElevenLabs Music API.

    Supports duration from 30 seconds to 5 minutes (300 seconds).
    If duration_seconds is None, uses auto mode.
    """
    try:
        logger.info(f"Music generation request from user {user['email']}, prompt={request.prompt[:50]}..., duration={request.duration_seconds}")

        client = get_elevenlabs_client()

        # Convert duration to milliseconds for ElevenLabs API
        # ElevenLabs accepts 3000ms (3s) to 600000ms (10min), but we limit to 30s-300s (5min)
        duration_ms = None
        if request.duration_seconds is not None:
            # Clamp to valid range: 30 seconds to 300 seconds (5 minutes)
            clamped_duration = max(30, min(300, request.duration_seconds))
            duration_ms = clamped_duration * 1000
            logger.info(f"Using duration: {clamped_duration}s ({duration_ms}ms)")

        # Call ElevenLabs Music API
        # The SDK should have a music.generate or similar method
        import httpx

        # Use direct API call - endpoint is /v1/music/compose
        api_url = "https://api.elevenlabs.io/v1/music/compose"
        headers = {
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json"
        }

        payload = {
            "prompt": request.prompt,
        }

        if duration_ms is not None:
            payload["music_length_ms"] = duration_ms

        logger.info(f"Calling ElevenLabs Music API: {api_url} with payload: {payload}")

        async with httpx.AsyncClient(timeout=300.0) as http_client:
            response = await http_client.post(api_url, json=payload, headers=headers)

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Invalid ElevenLabs API key")

            if response.status_code == 422:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                logger.error(f"ElevenLabs validation error: {error_detail}")
                raise HTTPException(status_code=422, detail=f"Invalid request: {error_detail}")

            if response.status_code != 200:
                logger.error(f"ElevenLabs API error: {response.status_code} - {response.text[:500]}")
                raise HTTPException(status_code=response.status_code, detail=f"ElevenLabs API error: {response.text[:200]}")

            # Response is audio bytes directly
            audio_bytes = response.content
            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

            logger.info(f"Generated music: {len(audio_bytes)} bytes")

            return GenerateMusicResponse(
                audio_base64=audio_base64,
                mime_type="audio/mpeg",
                duration_seconds=request.duration_seconds
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Music generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
