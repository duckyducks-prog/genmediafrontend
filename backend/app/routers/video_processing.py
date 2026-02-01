"""
Video processing router for ffmpeg-based operations.
"""
import asyncio
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


async def run_ffmpeg_async(cmd: List[str], timeout: int = 120) -> subprocess.CompletedProcess:
    """Run FFmpeg command asynchronously without blocking the event loop."""
    def _run():
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return await asyncio.to_thread(_run)


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
    aspect_ratio: str = Field(default="16:9", description="Output aspect ratio: 16:9, 9:16, 1:1, 4:3, or 4:5")
    trim_silence: bool = Field(default=False, description="Auto-trim trailing silence from video clips before merging")


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
    video_base64: Optional[str] = Field(default=None, description="Base64 encoded video")
    video_url: Optional[str] = Field(default=None, description="GCS/HTTP URL to video")
    audio_base64: Optional[str] = Field(default=None, description="Base64 encoded audio")
    audio_url: Optional[str] = Field(default=None, description="GCS/HTTP URL to audio")
    music_volume: int = Field(default=50, description="Music volume 0-100")
    original_volume: int = Field(default=100, description="Original audio volume 0-100")


class AddMusicResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


class FilterConfig(BaseModel):
    type: str = Field(..., description="Filter type (brightness, blur, hueSaturation, filmGrain, etc.)")
    params: Dict[str, Any] = Field(..., description="Filter parameters")


class ApplyFiltersRequest(BaseModel):
    video_base64: Optional[str] = Field(default=None, description="Base64 encoded video")
    video_url: Optional[str] = Field(default=None, description="GCS/HTTP URL (preferred for large files)")
    filters: List[FilterConfig] = Field(..., description="List of filters to apply in order")


class ApplyFiltersResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"


def clean_base64(b64_string: str) -> bytes:
    """Clean base64 string and decode to bytes."""
    if not b64_string:
        raise ValueError("Empty base64 string provided")

    # Remove data URL prefix if present
    if b64_string.startswith("data:"):
        comma_idx = b64_string.find(",")
        if comma_idx != -1:
            b64_string = b64_string[comma_idx + 1:]

    # Remove whitespace and URL-safe characters that might have been introduced
    b64_string = b64_string.strip().replace("\n", "").replace("\r", "").replace(" ", "")

    # Replace URL-safe characters with standard base64 characters
    b64_string = b64_string.replace("-", "+").replace("_", "/")

    # Fix padding
    padding_needed = len(b64_string) % 4
    if padding_needed:
        b64_string += "=" * (4 - padding_needed)

    try:
        return base64.b64decode(b64_string)
    except Exception as e:
        logger.error(f"Base64 decode failed: {e}, string length: {len(b64_string)}, first 50 chars: {b64_string[:50]}")
        raise ValueError(f"Invalid base64 data: {str(e)}")


async def download_video_from_url(url: str, timeout: float = 120.0) -> bytes:
    """Download video from URL (GCS or HTTP)."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def detect_trailing_silence(video_path: str, noise_db: float = -30, min_duration: float = 0.3) -> Optional[float]:
    """
    Detect trailing silence in a video and return the trim point (end of last non-silent audio).

    Args:
        video_path: Path to video file
        noise_db: Silence threshold in dB (default -30dB)
        min_duration: Minimum silence duration to detect in seconds (default 0.3s)

    Returns:
        Trim point in seconds (time to trim video to), or None if no trailing silence found
    """
    import re

    # First check if video has an audio track
    probe_info = probe_video(video_path)
    has_audio = False
    for stream in probe_info.get("streams", []):
        if stream.get("codec_type") == "audio":
            has_audio = True
            break

    if not has_audio:
        logger.debug(f"No audio track in {video_path}, skipping silence detection")
        return None

    # Get video duration
    duration = float(probe_info.get("format", {}).get("duration", 0))
    if duration <= 0:
        logger.warning(f"Could not get duration for {video_path}")
        return None

    # Use silencedetect filter to find silence periods
    detect_cmd = [
        "ffmpeg", "-i", video_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
        "-f", "null", "-"
    ]

    logger.debug(f"Running silence detection: {' '.join(detect_cmd)}")
    result = subprocess.run(detect_cmd, capture_output=True, text=True)
    stderr = result.stderr

    # Log the output for debugging
    logger.debug(f"Silence detection output: {stderr[-500:] if len(stderr) > 500 else stderr}")

    # Parse silence_start and silence_end from output
    # Format: [silencedetect @ 0x...] silence_start: 5.123
    # Format: [silencedetect @ 0x...] silence_end: 7.456 | silence_duration: 2.333
    silence_starts = re.findall(r'silence_start:\s*([\d.]+)', stderr)
    silence_ends = re.findall(r'silence_end:\s*([\d.]+)', stderr)

    logger.info(f"Silence detection for {video_path}: found {len(silence_starts)} silence periods, duration={duration:.2f}s")

    if not silence_starts:
        logger.debug(f"No silence detected in {video_path}")
        return None

    # Check if the last silence extends to the end of the video
    last_silence_start = float(silence_starts[-1])

    logger.debug(f"Last silence starts at {last_silence_start}s, video duration {duration}s")

    # Case 1: Last silence has no end marker - means it extends to end of video
    if len(silence_ends) < len(silence_starts):
        trim_point = last_silence_start
        logger.info(f"Trailing silence detected (no end marker): starts at {trim_point:.2f}s, video duration {duration:.2f}s")
        return trim_point

    # Case 2: Last silence_end is close to video duration (within 0.5s tolerance)
    last_silence_end = float(silence_ends[-1])
    if abs(last_silence_end - duration) < 0.5:
        trim_point = last_silence_start
        logger.info(f"Trailing silence detected: {last_silence_start:.2f}s to {last_silence_end:.2f}s (duration: {duration:.2f}s)")
        return trim_point

    logger.debug(f"No trailing silence found in {video_path} (last silence ends at {last_silence_end:.2f}s, video ends at {duration:.2f}s)")
    return None


def trim_video_to_point(video_path: str, trim_point: float, output_path: str) -> bool:
    """
    Trim video to specified point using FFmpeg.

    Args:
        video_path: Input video path
        trim_point: Time in seconds to trim to
        output_path: Output video path

    Returns:
        True if successful, False otherwise
    """
    if trim_point <= 0:
        return False

    trim_cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-t", str(trim_point),
        "-c:v", "copy",
        "-c:a", "copy",
        output_path
    ]

    result = subprocess.run(trim_cmd, capture_output=True, text=True)

    if result.returncode != 0:
        logger.warning(f"Trim failed for {video_path}: {get_ffmpeg_error(result.stderr)}")
        return False

    return True


def filter_config_to_ffmpeg(filter_config: FilterConfig) -> str:
    """
    Convert a FilterConfig object to an FFmpeg filter string.

    Maps frontend filter types and parameters to FFmpeg video filter syntax.
    """
    filter_type = filter_config.type
    params = filter_config.params

    if filter_type == "brightness":
        # FFmpeg eq filter: brightness range -1.0 to 1.0
        brightness = params.get("brightness", 0)
        contrast = params.get("contrast", 0)
        # eq filter: brightness=-1 to 1, contrast=0 to 4 (default 1)
        # Convert contrast from -1..1 to 0..2 (1 is neutral)
        contrast_ffmpeg = 1.0 + contrast
        return f"eq=brightness={brightness}:contrast={contrast_ffmpeg}"

    elif filter_type == "blur":
        # FFmpeg boxblur or gblur
        strength = params.get("strength", 0)
        # Map strength 0-50 to blur radius
        # Use gblur (Gaussian blur) which is similar to PixiJS BlurFilter
        if strength <= 0:
            return None  # No filter needed
        # gblur sigma parameter (0.01 to 1024)
        sigma = min(max(strength / 2.0, 0.01), 1024)
        return f"gblur=sigma={sigma}"

    elif filter_type == "hueSaturation":
        # FFmpeg hue filter
        hue = params.get("hue", 0)  # 0-360 degrees
        saturation = params.get("saturation", 0)  # -1 to 1
        # hue filter: h=angle (degrees), s=saturation (-10 to 10, default 1)
        # Convert saturation -1..1 to 0..2 (1 is neutral)
        saturation_ffmpeg = 1.0 + saturation
        return f"hue=h={hue}:s={saturation_ffmpeg}"

    elif filter_type == "filmGrain":
        # FFmpeg noise filter for film grain simulation
        intensity = params.get("intensity", 0)
        # noise filter: alls=strength (0-100)
        if intensity <= 0:
            return None
        # Map intensity 0-100 to noise strength
        strength = min(max(intensity, 0), 100)
        return f"noise=alls={strength}:allf=t"

    elif filter_type == "sharpen":
        # FFmpeg unsharp filter
        gamma = params.get("gamma", 1.0)
        # unsharp filter for sharpening
        # unsharp=luma_amount (default 1.0, 0-5)
        amount = min(max(gamma, 0), 5)
        if amount == 1.0:
            return None
        return f"unsharp=5:5:{amount}:5:5:{amount}"

    elif filter_type == "vignette":
        # FFmpeg vignette filter
        intensity = params.get("intensity", 0.5)
        # vignette filter: angle=PI/5 (default), mode=forward
        # For intensity, we can use the vignette filter directly
        return f"vignette=angle=PI/{5.0/intensity}"

    elif filter_type == "crop":
        # Crop filter handled separately - skip for now
        # FFmpeg crop filter: crop=w:h:x:y
        return None

    else:
        logger.warning(f"Unknown filter type: {filter_type}")
        return None


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
            logger.info(f"Merge videos request from user {user['email']}, count={len(videos_data)} (using URLs), trim_silence={request.trim_silence}")
        elif request.videos_base64 and len(request.videos_base64) > 0:
            videos_data = request.videos_base64
            use_urls = False
            logger.info(f"Merge videos request from user {user['email']}, count={len(videos_data)} (using base64), trim_silence={request.trim_silence}")
        else:
            raise HTTPException(status_code=400, detail="Either videos_base64 or video_urls must be provided")

        if len(videos_data) < 2:
            raise HTTPException(status_code=400, detail="At least 2 videos required")

        if len(videos_data) > 25:
            raise HTTPException(status_code=400, detail="Maximum 25 videos allowed")

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

            # Apply silence trimming if enabled
            if request.trim_silence:
                logger.info(f"Trim silence enabled - detecting and trimming trailing silence for {len(video_paths)} videos")
                trimmed_paths = []
                for i, video_path in enumerate(video_paths):
                    # Try progressively more sensitive thresholds
                    # -30dB: strict (only very quiet silence)
                    # -40dB: medium (quiet ambient)
                    # -50dB: lenient (catches most trailing silence)
                    trim_point = detect_trailing_silence(video_path, noise_db=-30, min_duration=0.1)
                    if trim_point is None:
                        logger.debug(f"Video {i}: no silence at -30dB, trying -40dB")
                        trim_point = detect_trailing_silence(video_path, noise_db=-40, min_duration=0.1)
                    if trim_point is None:
                        logger.debug(f"Video {i}: no silence at -40dB, trying -50dB")
                        trim_point = detect_trailing_silence(video_path, noise_db=-50, min_duration=0.1)

                    if trim_point is not None and trim_point > 0.5:
                        # Create trimmed version
                        trimmed_path = os.path.join(tmpdir, f"trimmed_{i}.mp4")
                        if trim_video_to_point(video_path, trim_point, trimmed_path):
                            logger.info(f"Video {i} trimmed from {trim_point:.2f}s to end")
                            trimmed_paths.append(trimmed_path)
                            # Re-probe the trimmed video
                            video_infos[i] = probe_video(trimmed_path)
                        else:
                            logger.warning(f"Video {i} trim failed, using original")
                            trimmed_paths.append(video_path)
                    else:
                        logger.info(f"Video {i}: no trailing silence detected, using original")
                        trimmed_paths.append(video_path)
                video_paths = trimmed_paths
                logger.info(f"Silence trimming complete, proceeding with merge")

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

            # Determine output resolution based on aspect ratio
            aspect_ratio = request.aspect_ratio or "16:9"
            aspect_resolutions = {
                "16:9": (1920, 1080),
                "9:16": (1080, 1920),
                "1:1": (1080, 1080),
                "4:3": (1440, 1080),
                "4:5": (1080, 1350),
            }
            output_width, output_height = aspect_resolutions.get(aspect_ratio, (1920, 1080))
            logger.info(f"Output aspect ratio: {aspect_ratio}, resolution: {output_width}x{output_height}")

            # Build filter_complex using concat filter
            # This normalizes all inputs to same format before concatenating
            filter_parts = []
            concat_inputs = ""

            for i in range(n):
                # Scale and pad video to consistent size, set framerate
                filter_parts.append(
                    f"[{i}:v]scale={output_width}:{output_height}:force_original_aspect_ratio=decrease,"
                    f"pad={output_width}:{output_height}:(ow-iw)/2:(oh-ih)/2:black,"
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
            result = await run_ffmpeg_async(merge_cmd)

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

            result = await run_ffmpeg_async(filter_cmd)

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

        # Validate input - need either video_base64 or video_url
        if not request.video_base64 and not request.video_url:
            raise HTTPException(status_code=400, detail="Either video_base64 or video_url must be provided")
        if not request.audio_base64 and not request.audio_url:
            raise HTTPException(status_code=400, detail="Either audio_base64 or audio_url must be provided")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Get video bytes from base64 or URL
            if request.video_url:
                logger.info(f"Downloading video from URL: {request.video_url[:80]}...")
                video_bytes = await download_video_from_url(request.video_url)
            else:
                video_bytes = clean_base64(request.video_base64)
            video_path = os.path.join(tmpdir, "input.mp4")
            with open(video_path, "wb") as f:
                f.write(video_bytes)
            logger.info(f"Saved video: {len(video_bytes)} bytes")

            # Get audio bytes from base64 or URL
            if request.audio_url:
                logger.info(f"Downloading audio from URL: {request.audio_url[:80]}...")
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                    response = await client.get(request.audio_url)
                    response.raise_for_status()
                    audio_bytes = response.content
            else:
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
                result = await run_ffmpeg_async(mix_cmd)

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
                    result = await run_ffmpeg_async(mix_cmd)
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

                result = await run_ffmpeg_async(mix_cmd)

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
                result = await run_ffmpeg_async(simple_cmd)

                if result.returncode != 0:
                    # Last resort: re-encode audio
                    simple_cmd[-4] = "aac"  # Change -c:a copy to -c:a aac
                    result = await run_ffmpeg_async(simple_cmd)

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
    watermark_base64: Optional[str] = Field(default=None, description="Base64 encoded watermark image (PNG with transparency)")
    watermark_url: Optional[str] = Field(default=None, description="GCS/HTTP URL to watermark image")
    position: str = Field(default="bottom-right", description="Position: top-left, top-right, bottom-left, bottom-right, center")
    opacity: float = Field(default=1.0, description="Watermark opacity (0.0 to 1.0)")
    scale: float = Field(default=0.15, description="Scale relative to video width (0.0 to 1.0)")
    margin: int = Field(default=20, description="Margin from edges in pixels")
    mode: str = Field(default="watermark", description="Mode: watermark (scaled corner logo) or overlay (full-frame)")


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

            # Validate and get watermark bytes
            if not request.watermark_base64 and not request.watermark_url:
                raise HTTPException(status_code=400, detail="Either watermark_base64 or watermark_url must be provided")

            # Get watermark bytes from URL or base64
            if request.watermark_url:
                logger.info(f"Downloading watermark from URL: {request.watermark_url[:80]}...")
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                    response = await client.get(request.watermark_url)
                    if response.status_code != 200:
                        raise HTTPException(status_code=400, detail=f"Failed to download watermark: {response.status_code}")
                    watermark_bytes = response.content
            else:
                watermark_bytes = clean_base64(request.watermark_base64)

            watermark_path = os.path.join(tmpdir, "watermark.png")
            with open(watermark_path, "wb") as f:
                f.write(watermark_bytes)
            logger.info(f"Saved watermark: {len(watermark_bytes)} bytes")

            # Probe watermark image for format info
            watermark_probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", watermark_path]
            watermark_probe_result = subprocess.run(watermark_probe_cmd, capture_output=True, text=True)
            if watermark_probe_result.returncode == 0:
                try:
                    watermark_info = json.loads(watermark_probe_result.stdout)
                    for stream in watermark_info.get("streams", []):
                        if stream.get("codec_type") == "video":
                            logger.info(f"Watermark info: {stream.get('width')}x{stream.get('height')}, "
                                       f"codec={stream.get('codec_name')}, pix_fmt={stream.get('pix_fmt')}")
                except json.JSONDecodeError:
                    logger.warning("Could not parse watermark probe output")
            else:
                logger.warning(f"Watermark probe failed: {watermark_probe_result.stderr}")

            # Probe video for dimensions
            video_info = probe_video(video_path)
            video_width = 1280
            video_height = 720
            for stream in video_info.get("streams", []):
                if stream.get("codec_type") == "video":
                    video_width = stream.get("width", 1280)
                    video_height = stream.get("height", 720)
                    break

            logger.info(f"Video dimensions: {video_width}x{video_height}, mode={request.mode}")

            if request.mode == "overlay":
                # Full-frame overlay mode - scale image to fit video, overlay at 0:0
                # This is for transparent PNGs that should cover the entire frame
                filter_complex = (
                    f"[1:v]scale={video_width}:{video_height}:force_original_aspect_ratio=decrease,"
                    f"pad={video_width}:{video_height}:(ow-iw)/2:(oh-ih)/2:color=black@0.0,"
                    f"format=rgba,colorchannelmixer=aa={request.opacity}[overlay];"
                    f"[0:v][overlay]overlay=0:0:format=auto,format=yuv420p[vout]"
                )
            else:
                # Watermark mode - small logo in corner
                # Calculate watermark size based on scale (ensure even width for h264)
                watermark_width = int(video_width * request.scale)
                # Make sure width is even for h264 compatibility
                watermark_width = watermark_width + (watermark_width % 2)
                # Minimum size check
                if watermark_width < 10:
                    watermark_width = 10

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

                # Build filter for watermark
                # Scale watermark, apply opacity, overlay, then convert to yuv420p for h264
                filter_complex = (
                    f"[1:v]scale={watermark_width}:-2,format=rgba,"
                    f"colorchannelmixer=aa={request.opacity}[watermark];"
                    f"[0:v][watermark]overlay={overlay_position}:format=auto,format=yuv420p[vout]"
                )

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build FFmpeg command
            # overlay filter applies static image to each video frame automatically
            overlay_cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", watermark_path,
                "-filter_complex", filter_complex,
                "-map", "[vout]",  # Use filtered video output
                "-map", "0:a?",  # Copy audio if present
                "-c:v", "libx264",
                "-preset", "ultrafast",  # Faster encoding
                "-crf", "23",
                "-c:a", "copy",
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg watermark overlay: {' '.join(overlay_cmd)}")
            try:
                result = await run_ffmpeg_async(overlay_cmd, timeout=120)
            except subprocess.TimeoutExpired:
                logger.error("FFmpeg watermark timed out after 120 seconds")
                raise HTTPException(status_code=500, detail="Video processing timed out")

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"FFmpeg watermark failed. Command: {' '.join(overlay_cmd)}")
                logger.error(f"FFmpeg stderr: {result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr}")
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


# =============================================================================
# VIDEO SEGMENT REPLACE ENDPOINT
# =============================================================================

class SegmentReplaceRequest(BaseModel):
    base_video_base64: Optional[str] = Field(default=None, description="Base64 encoded base video")
    base_video_url: Optional[str] = Field(default=None, description="URL to base video")
    replacement_video_base64: Optional[str] = Field(default=None, description="Base64 encoded replacement video")
    replacement_video_url: Optional[str] = Field(default=None, description="URL to replacement video")
    start_time: float = Field(..., description="Start time in seconds for replacement")
    end_time: float = Field(..., description="End time in seconds for replacement")
    audio_mode: str = Field(default="keep_base", description="Audio mode: keep_base, keep_replacement, mix")
    fit_mode: str = Field(default="trim", description="Fit mode: stretch, trim, loop")


class SegmentReplaceResponse(BaseModel):
    video_base64: str
    mime_type: str = "video/mp4"
    duration: float = 0.0


@router.post("/segment-replace", response_model=SegmentReplaceResponse)
async def replace_video_segment(
    request: SegmentReplaceRequest,
    user: dict = Depends(get_current_user)
):
    """
    Replace a segment of the base video with a replacement video.

    This allows you to swap out a portion of a video while preserving
    the rest (including audio if desired).
    """
    try:
        logger.info(f"Segment replace request from user {user['email']}, start={request.start_time}, end={request.end_time}, audio_mode={request.audio_mode}")

        # Validate inputs
        if not request.base_video_base64 and not request.base_video_url:
            raise HTTPException(status_code=400, detail="Either base_video_base64 or base_video_url must be provided")
        if not request.replacement_video_base64 and not request.replacement_video_url:
            raise HTTPException(status_code=400, detail="Either replacement_video_base64 or replacement_video_url must be provided")
        if request.start_time < 0:
            raise HTTPException(status_code=400, detail="start_time must be >= 0")
        if request.end_time <= request.start_time:
            raise HTTPException(status_code=400, detail="end_time must be greater than start_time")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Get base video bytes
            if request.base_video_url:
                logger.info(f"Downloading base video from URL")
                base_bytes = await download_video_from_url(request.base_video_url)
            else:
                base_bytes = clean_base64(request.base_video_base64)

            # Get replacement video bytes
            if request.replacement_video_url:
                logger.info(f"Downloading replacement video from URL")
                replacement_bytes = await download_video_from_url(request.replacement_video_url)
            else:
                replacement_bytes = clean_base64(request.replacement_video_base64)

            # Save videos
            base_path = os.path.join(tmpdir, "base.mp4")
            replacement_path = os.path.join(tmpdir, "replacement.mp4")

            with open(base_path, "wb") as f:
                f.write(base_bytes)
            with open(replacement_path, "wb") as f:
                f.write(replacement_bytes)

            logger.info(f"Saved base video: {len(base_bytes)} bytes, replacement: {len(replacement_bytes)} bytes")

            # Probe videos for duration
            base_info = probe_video(base_path)
            replacement_info = probe_video(replacement_path)

            base_duration = float(base_info.get("format", {}).get("duration", 0))
            replacement_duration = float(replacement_info.get("format", {}).get("duration", 0))

            logger.info(f"Base duration: {base_duration}s, Replacement duration: {replacement_duration}s")

            # Validate times against base duration
            if request.end_time > base_duration:
                request.end_time = base_duration
                logger.warning(f"end_time adjusted to base duration: {base_duration}")

            segment_duration = request.end_time - request.start_time

            # Calculate how to fit the replacement
            if request.fit_mode == "stretch":
                # Stretch/compress replacement to fit segment duration
                speed_factor = replacement_duration / segment_duration if segment_duration > 0 else 1.0
                replacement_filter = f"setpts={1/speed_factor}*PTS"
            elif request.fit_mode == "loop":
                # Loop replacement if shorter, trim if longer
                if replacement_duration < segment_duration:
                    loop_count = int(segment_duration / replacement_duration) + 1
                    replacement_filter = f"loop=loop={loop_count}:size=999999,trim=duration={segment_duration},setpts=PTS-STARTPTS"
                else:
                    replacement_filter = f"trim=duration={segment_duration},setpts=PTS-STARTPTS"
            else:  # trim (default)
                # Use replacement as-is, trim if longer than segment
                if replacement_duration > segment_duration:
                    replacement_filter = f"trim=duration={segment_duration},setpts=PTS-STARTPTS"
                else:
                    replacement_filter = "setpts=PTS-STARTPTS"

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build FFmpeg filter based on audio mode
            # Split base video into: before (0 to start), after (end to duration)
            # Insert replacement in the middle

            has_before = request.start_time > 0
            has_after = request.end_time < base_duration

            # Video filter chain
            filter_parts = []
            concat_inputs = []

            if has_before:
                filter_parts.append(f"[0:v]trim=0:{request.start_time},setpts=PTS-STARTPTS[v_before]")
                concat_inputs.append("[v_before]")

            filter_parts.append(f"[1:v]{replacement_filter}[v_replace]")
            concat_inputs.append("[v_replace]")

            if has_after:
                filter_parts.append(f"[0:v]trim={request.end_time}:{base_duration},setpts=PTS-STARTPTS[v_after]")
                concat_inputs.append("[v_after]")

            n_segments = len(concat_inputs)
            filter_parts.append(f"{''.join(concat_inputs)}concat=n={n_segments}:v=1:a=0[outv]")

            # Audio filter chain based on mode
            if request.audio_mode == "keep_replacement":
                # Use replacement audio, pad/trim to match
                filter_parts.append(f"[1:a]asetpts=PTS-STARTPTS[outa]")
            elif request.audio_mode == "mix":
                # Mix both audio tracks
                filter_parts.append(f"[0:a][1:a]amix=inputs=2:duration=first[outa]")
            else:  # keep_base (default)
                # Keep original audio from base
                filter_parts.append(f"[0:a]acopy[outa]")

            filter_complex = ";".join(filter_parts)

            # Build FFmpeg command
            cmd = [
                "ffmpeg", "-y",
                "-i", base_path,
                "-i", replacement_path,
                "-filter_complex", filter_complex,
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg segment replace")
            logger.debug(f"Filter complex: {filter_complex}")

            result = await run_ffmpeg_async(cmd)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"FFmpeg segment replace failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to replace segment: {error_msg}")

            # Read output and get duration
            with open(output_path, "rb") as f:
                output_bytes = f.read()

            output_info = probe_video(output_path)
            output_duration = float(output_info.get("format", {}).get("duration", 0))

            output_base64 = base64.b64encode(output_bytes).decode("utf-8")
            logger.info(f"Segment replace complete: {len(output_bytes)} bytes, duration: {output_duration}s")

            return SegmentReplaceResponse(
                video_base64=output_base64,
                mime_type="video/mp4",
                duration=output_duration
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Segment replace failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
