"""
Video processing router for ffmpeg-based operations.
"""
import base64
import tempfile
import subprocess
import os
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.auth import get_current_user
from app.logging_config import setup_logger

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/video", tags=["video-processing"])


def probe_video(video_path: str) -> Dict[str, Any]:
    """Probe video file to get format and stream information."""
    probe_cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        video_path
    ]
    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return json.loads(result.stdout)
    return {}


def get_ffmpeg_error(stderr: str) -> str:
    """Extract meaningful error from FFmpeg stderr output."""
    lines = stderr.strip().split('\n')
    # Look for actual error lines (skip banner/info)
    error_lines = []
    for line in lines:
        line_lower = line.lower()
        if any(keyword in line_lower for keyword in ['error', 'invalid', 'failed', 'no such', 'unable', 'cannot']):
            error_lines.append(line.strip())
    if error_lines:
        return '; '.join(error_lines[-3:])  # Last 3 error lines
    # Fallback: return last few non-empty lines
    non_empty = [l.strip() for l in lines if l.strip() and not l.startswith('  ')]
    return '; '.join(non_empty[-3:]) if non_empty else "Unknown FFmpeg error"


class MergeVideosRequest(BaseModel):
    videos_base64: Optional[List[str]] = Field(default=None, description="List of base64 encoded videos to merge")
    video_urls: Optional[List[str]] = Field(default=None, description="List of GCS/HTTP URLs to merge (preferred for large files)")


class MergeVideosResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


class ApplyFiltersRequest(BaseModel):
    video_base64: Optional[str] = Field(default=None, description="Base64 encoded video")
    video_url: Optional[str] = Field(default=None, description="GCS/HTTP URL to video (preferred for large files)")
    filters: List[Dict[str, Any]] = Field(..., description="List of filter configurations")


class ApplyFiltersResponse(BaseModel):
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


async def download_video_from_url(url: str, timeout: float = 120.0) -> bytes:
    """Download video from URL (GCS or HTTP)."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


@router.post("/merge", response_model=MergeVideosResponse)
async def merge_videos(
    request: MergeVideosRequest,
    user: dict = Depends(get_current_user)
):
    """
    Merge multiple videos into one using ffmpeg concat filter.
    Uses concat filter (not demuxer) for better compatibility with different video sources.

    Accepts either:
    - videos_base64: List of base64 encoded videos (for small files)
    - video_urls: List of GCS/HTTP URLs (preferred for large files, avoids request size limits)
    """
    try:
        # Determine which input format was provided
        videos_data: List[str] = []
        use_urls = False

        if request.video_urls and len(request.video_urls) > 0:
            videos_data = request.video_urls
            use_urls = True
            logger.info(f"Merge videos request from user {user['email']}, count={len(videos_data)} (using URLs)")
        elif request.videos_base64 and len(request.videos_base64) > 0:
            videos_data = request.videos_base64
            use_urls = False
            logger.info(f"Merge videos request from user {user['email']}, count={len(videos_data)} (using base64)")
        else:
            raise HTTPException(status_code=400, detail="Either videos_base64 or video_urls must be provided")

        if len(videos_data) < 2:
            raise HTTPException(status_code=400, detail="At least 2 videos required")

        if len(videos_data) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 videos allowed")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save all input videos and probe them
            video_paths = []
            video_infos = []
            for i, video_input in enumerate(videos_data):
                if use_urls:
                    # Download from URL
                    logger.info(f"Downloading video {i} from URL: {video_input[:80]}...")
                    try:
                        video_bytes = await download_video_from_url(video_input)
                    except httpx.HTTPError as e:
                        logger.error(f"Failed to download video {i}: {e}")
                        raise HTTPException(status_code=400, detail=f"Failed to download video {i+1}: {str(e)}")
                else:
                    # Decode from base64
                    video_bytes = clean_base64(video_input)

                video_path = os.path.join(tmpdir, f"input_{i}.mp4")
                with open(video_path, "wb") as f:
                    f.write(video_bytes)
                video_paths.append(video_path)

                # Probe each video for format info
                info = probe_video(video_path)
                video_infos.append(info)
                logger.info(f"Saved video {i}: {len(video_bytes)} bytes")

            output_path = os.path.join(tmpdir, "output.mp4")
            n = len(video_paths)

            # Build input arguments
            input_args = []
            for path in video_paths:
                input_args.extend(["-i", path])

            # Check if all videos have audio streams
            has_audio_list = []
            for info in video_infos:
                has_audio = False
                for stream in info.get("streams", []):
                    if stream.get("codec_type") == "audio":
                        has_audio = True
                        break
                has_audio_list.append(has_audio)

            all_have_audio = all(has_audio_list)
            any_has_audio = any(has_audio_list)
            logger.info(f"Audio status: {has_audio_list}, all_have_audio={all_have_audio}")

            # Build filter_complex using concat filter
            # This normalizes all inputs to same format before concatenating
            filter_parts = []
            concat_inputs = ""

            for i in range(n):
                # Scale and pad video to consistent size, set framerate
                filter_parts.append(
                    f"[{i}:v]scale=1280:720:force_original_aspect_ratio=decrease,"
                    f"pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,"
                    f"setsar=1,fps=30[v{i}]"
                )
                concat_inputs += f"[v{i}]"

                # Handle audio - generate silence if missing
                if all_have_audio:
                    filter_parts.append(f"[{i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a{i}]")
                    concat_inputs += f"[a{i}]"
                elif any_has_audio:
                    if has_audio_list[i]:
                        filter_parts.append(f"[{i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a{i}]")
                    else:
                        # Generate silent audio for videos without audio
                        filter_parts.append(f"anullsrc=r=44100:cl=stereo[a{i}]")
                    concat_inputs += f"[a{i}]"

            # Add concat filter
            if any_has_audio:
                filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]")
                map_args = ["-map", "[outv]", "-map", "[outa]"]
            else:
                filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=0[outv]")
                map_args = ["-map", "[outv]"]

            filter_complex = ";".join(filter_parts)

            # Build full command
            merge_cmd = [
                "ffmpeg", "-y",
                *input_args,
                "-filter_complex", filter_complex,
                *map_args,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg merge with concat filter, {n} inputs")
            logger.debug(f"Filter complex: {filter_complex}")
            result = subprocess.run(merge_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"ffmpeg merge failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to merge videos: {error_msg}")

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


def build_ffmpeg_filter_string(filters: List[Dict[str, Any]]) -> str:
    """
    Convert filter configurations to FFmpeg video filter string.
    Supports: hueSaturation, brightnessContrast, blur, sharpen, vignette, filmGrain, noise
    """
    filter_parts = []

    for f in filters:
        filter_type = f.get("type", "")
        params = f.get("params", {})

        if filter_type == "hueSaturation":
            # FFmpeg eq filter for hue/saturation
            # hue is in degrees (-180 to 180), saturation is multiplier (0 to 2)
            hue = params.get("hue", 0)
            saturation = params.get("saturation", 1)
            # Convert hue from degrees to FFmpeg hue (in radians or use hue filter)
            if hue != 0:
                filter_parts.append(f"hue=h={hue}")
            if saturation != 1:
                filter_parts.append(f"eq=saturation={saturation}")

        elif filter_type == "brightnessContrast":
            brightness = params.get("brightness", 0)
            contrast = params.get("contrast", 1)
            # FFmpeg eq filter: brightness is -1 to 1, contrast is 0 to 2
            if brightness != 0 or contrast != 1:
                filter_parts.append(f"eq=brightness={brightness}:contrast={contrast}")

        elif filter_type == "blur":
            # Use boxblur for simplicity
            strength = params.get("strength", 0)
            if strength > 0:
                # Map strength (0-10) to blur radius
                radius = int(strength * 2) + 1
                filter_parts.append(f"boxblur={radius}:{radius}")

        elif filter_type == "sharpen":
            amount = params.get("amount", 0)
            if amount > 0:
                # Use unsharp mask
                filter_parts.append(f"unsharp=5:5:{amount}:5:5:{amount/2}")

        elif filter_type == "vignette":
            intensity = params.get("intensity", 0)
            if intensity > 0:
                # FFmpeg vignette filter
                filter_parts.append(f"vignette=PI/{4-intensity*2}:1")

        elif filter_type == "filmGrain":
            amount = params.get("amount", 0)
            if amount > 0:
                # Use noise filter with film grain characteristics
                filter_parts.append(f"noise=alls={int(amount*10)}:allf=t")

        elif filter_type == "noise":
            amount = params.get("amount", 0)
            if amount > 0:
                filter_parts.append(f"noise=alls={int(amount*20)}:allf=u")

    return ",".join(filter_parts) if filter_parts else ""


@router.post("/apply-filters", response_model=ApplyFiltersResponse)
async def apply_filters_to_video(
    request: ApplyFiltersRequest,
    user: dict = Depends(get_current_user)
):
    """
    Apply visual filters to a video using FFmpeg.
    Supports filters: hueSaturation, brightnessContrast, blur, sharpen, vignette, filmGrain, noise
    """
    try:
        logger.info(f"Apply filters request from user {user['email']}, filter_count={len(request.filters)}")

        if not request.filters:
            raise HTTPException(status_code=400, detail="No filters provided")

        # Get video input
        if not request.video_base64 and not request.video_url:
            raise HTTPException(status_code=400, detail="Either video_base64 or video_url must be provided")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Get video bytes
            if request.video_url:
                logger.info(f"Downloading video from URL: {request.video_url[:80]}...")
                try:
                    video_bytes = await download_video_from_url(request.video_url)
                except httpx.HTTPError as e:
                    logger.error(f"Failed to download video: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to download video: {str(e)}")
            else:
                video_bytes = clean_base64(request.video_base64)

            # Save input video
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(video_bytes)
            logger.info(f"Saved video: {len(video_bytes)} bytes")

            # Build filter string
            filter_string = build_ffmpeg_filter_string(request.filters)

            if not filter_string:
                logger.info("No applicable filters, returning original video")
                return ApplyFiltersResponse(
                    video_base64=base64.b64encode(video_bytes).decode("utf-8"),
                    mime_type="video/mp4"
                )

            logger.info(f"Applying FFmpeg filters: {filter_string}")

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build FFmpeg command
            filter_cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-vf", filter_string,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "copy",  # Preserve audio
                "-movflags", "+faststart",
                output_path
            ]

            result = subprocess.run(filter_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"FFmpeg filter failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to apply filters: {error_msg}")

            # Read output
            with open(output_path, "rb") as f:
                output_bytes = f.read()

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")
            logger.info(f"Filter application complete: {len(output_bytes)} bytes")

            return ApplyFiltersResponse(
                video_base64=output_base64,
                mime_type="video/mp4"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Apply filters failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add-music", response_model=AddMusicResponse)
async def add_music_to_video(
    request: AddMusicRequest,
    user: dict = Depends(get_current_user)
):
    """
    Add/mix music into a video using ffmpeg.
    Preserves original video codec (copy) and handles various audio formats.
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

            # Detect audio format from magic bytes (supports mp3, wav, flac, ogg, m4a/aac)
            audio_ext = "mp3"
            if len(audio_bytes) >= 4:
                if audio_bytes[:4] == b'RIFF':
                    audio_ext = "wav"
                elif audio_bytes[:3] == b'ID3' or audio_bytes[:2] == b'\xff\xfb' or audio_bytes[:2] == b'\xff\xfa':
                    audio_ext = "mp3"
                elif audio_bytes[:4] == b'fLaC':
                    audio_ext = "flac"
                elif audio_bytes[:4] == b'OggS':
                    audio_ext = "ogg"
                elif audio_bytes[4:8] == b'ftyp':
                    audio_ext = "m4a"

            audio_path = os.path.join(tmpdir, f"music.{audio_ext}")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)
            logger.info(f"Saved audio: {len(audio_bytes)} bytes, format: {audio_ext}")

            # Calculate volume multipliers (0-1 scale)
            music_vol = request.music_volume / 100.0
            orig_vol = request.original_volume / 100.0

            output_path = os.path.join(tmpdir, "output.mp4")

            # Probe video for audio stream info
            video_info = probe_video(video_path)
            has_audio = False
            for stream in video_info.get("streams", []):
                if stream.get("codec_type") == "audio":
                    has_audio = True
                    break
            logger.info(f"Video has audio: {has_audio}")

            # Get video duration for potential audio looping/trimming
            duration = None
            for stream in video_info.get("streams", []):
                if stream.get("codec_type") == "video":
                    duration = stream.get("duration")
                    break
            if not duration:
                duration = video_info.get("format", {}).get("duration")

            # Strategy: Use simpler, more robust approach
            # 1. If video has audio and we want to mix: use amerge (simpler than amix)
            # 2. If video has no audio or orig_vol is 0: just add music track

            if has_audio and orig_vol > 0:
                # Mix original audio with music using amerge + pan for volume control
                # amerge is more reliable than amix for two-stream mixing
                filter_complex = (
                    f"[0:a]volume={orig_vol}[orig];"
                    f"[1:a]volume={music_vol}[music];"
                    f"[orig][music]amerge=inputs=2,pan=stereo|c0<c0+c2|c1<c1+c3[aout]"
                )

                mix_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-filter_complex", filter_complex,
                    "-map", "0:v",
                    "-map", "[aout]",
                    "-c:v", "copy",  # Preserve original video codec
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    output_path
                ]

                logger.info(f"Running ffmpeg mix with amerge")
                result = subprocess.run(mix_cmd, capture_output=True, text=True)

                if result.returncode != 0:
                    logger.warning(f"amerge failed, trying amix fallback: {get_ffmpeg_error(result.stderr)}")
                    # Fallback to amix
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
                    result = subprocess.run(mix_cmd, capture_output=True, text=True)
            else:
                # No original audio or volume is 0 - just add music track directly
                logger.info(f"Adding music track only (no mixing)")
                mix_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",  # Preserve original video codec
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    output_path
                ]

                # Apply volume if not 100%
                if music_vol != 1.0:
                    mix_cmd = [
                        "ffmpeg", "-y",
                        "-i", video_path,
                        "-i", audio_path,
                        "-filter_complex", f"[1:a]volume={music_vol}[aout]",
                        "-map", "0:v",
                        "-map", "[aout]",
                        "-c:v", "copy",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-shortest",
                        output_path
                    ]

                result = subprocess.run(mix_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"ffmpeg add music failed: {result.stderr}")

                # Final fallback: simplest possible command
                logger.info("Trying simplest fallback command")
                simple_cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", audio_path,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "copy",  # Try to copy audio codec too
                    "-shortest",
                    output_path
                ]
                result = subprocess.run(simple_cmd, capture_output=True, text=True)

                if result.returncode != 0:
                    # Last resort: re-encode audio
                    simple_cmd[-4] = "aac"  # Change -c:a copy to -c:a aac
                    result = subprocess.run(simple_cmd, capture_output=True, text=True)

                    if result.returncode != 0:
                        error_msg = get_ffmpeg_error(result.stderr)
                        logger.error(f"All ffmpeg attempts failed: {result.stderr}")
                        raise HTTPException(status_code=500, detail=f"Failed to add music: {error_msg}")

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


class AddWatermarkRequest(BaseModel):
    video_base64: Optional[str] = Field(default=None, description="Base64 encoded video")
    video_url: Optional[str] = Field(default=None, description="GCS/HTTP URL to video")
    watermark_base64: str = Field(..., description="Base64 encoded watermark image (PNG with transparency)")
    position: str = Field(default="bottom-right", description="Position: top-left, top-right, bottom-left, bottom-right, center")
    opacity: float = Field(default=1.0, description="Watermark opacity (0.0 to 1.0)")
    scale: float = Field(default=0.15, description="Scale relative to video width (0.0 to 1.0)")
    margin: int = Field(default=20, description="Margin from edges in pixels")


class AddWatermarkResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


@router.post("/add-watermark", response_model=AddWatermarkResponse)
async def add_watermark_to_video(
    request: AddWatermarkRequest,
    user: dict = Depends(get_current_user)
):
    """
    Add a watermark/logo overlay to a video using FFmpeg.
    Supports PNG with transparency for logo overlays.
    """
    try:
        logger.info(f"Add watermark request from user {user['email']}, position={request.position}, opacity={request.opacity}")

        if not request.video_base64 and not request.video_url:
            raise HTTPException(status_code=400, detail="Either video_base64 or video_url must be provided")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Get video bytes
            if request.video_url:
                logger.info(f"Downloading video from URL: {request.video_url[:80]}...")
                try:
                    video_bytes = await download_video_from_url(request.video_url)
                except httpx.HTTPError as e:
                    logger.error(f"Failed to download video: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to download video: {str(e)}")
            else:
                video_bytes = clean_base64(request.video_base64)

            # Save input video
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(video_bytes)
            logger.info(f"Saved video: {len(video_bytes)} bytes")

            # Save watermark image
            watermark_bytes = clean_base64(request.watermark_base64)
            watermark_path = os.path.join(tmpdir, "watermark.png")
            with open(watermark_path, "wb") as f:
                f.write(watermark_bytes)
            logger.info(f"Saved watermark: {len(watermark_bytes)} bytes")

            # Probe video for dimensions
            video_info = probe_video(video_path)
            video_width = 1280
            video_height = 720
            for stream in video_info.get("streams", []):
                if stream.get("codec_type") == "video":
                    video_width = stream.get("width", 1280)
                    video_height = stream.get("height", 720)
                    break

            # Calculate watermark size based on scale
            watermark_width = int(video_width * request.scale)

            # Position mapping
            margin = request.margin
            position_map = {
                "top-left": f"{margin}:{margin}",
                "top-right": f"W-w-{margin}:{margin}",
                "bottom-left": f"{margin}:H-h-{margin}",
                "bottom-right": f"W-w-{margin}:H-h-{margin}",
                "center": "(W-w)/2:(H-h)/2",
            }
            overlay_position = position_map.get(request.position, position_map["bottom-right"])

            # Build filter for overlay
            # Scale watermark, apply opacity, then overlay
            filter_complex = (
                f"[1:v]scale={watermark_width}:-1,format=rgba,"
                f"colorchannelmixer=aa={request.opacity}[watermark];"
                f"[0:v][watermark]overlay={overlay_position}"
            )

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build FFmpeg command
            overlay_cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", watermark_path,
                "-filter_complex", filter_complex,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "copy",
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg watermark overlay")
            result = subprocess.run(overlay_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"FFmpeg watermark failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to add watermark: {error_msg}")

            # Read output
            with open(output_path, "rb") as f:
                output_bytes = f.read()

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")
            logger.info(f"Add watermark complete: {len(output_bytes)} bytes")

            return AddWatermarkResponse(
                video_base64=output_base64,
                mime_type="video/mp4"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add watermark failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
