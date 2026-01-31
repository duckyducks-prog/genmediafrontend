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


class AddMusicRequest(BaseModel):
    video_base64: str = Field(..., description="Base64 encoded video")
    audio_base64: str = Field(..., description="Base64 encoded audio")
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


@router.post("/apply-filters", response_model=ApplyFiltersResponse)
async def apply_filters_to_video(
    request: ApplyFiltersRequest,
    user: dict = Depends(get_current_user)
):
    """
    Apply a chain of filters to a video using ffmpeg filter_complex.

    Accepts either:
    - video_base64: Base64 encoded video (for small files)
    - video_url: GCS/HTTP URL (preferred for large files)

    Filters are applied in the order specified.
    """
    try:
        logger.info(f"Apply filters request from user {user['email']}, filter_count={len(request.filters)}")

        # Validate input
        if not request.video_base64 and not request.video_url:
            raise HTTPException(status_code=400, detail="Either video_base64 or video_url must be provided")

        if not request.filters or len(request.filters) == 0:
            raise HTTPException(status_code=400, detail="At least one filter must be provided")

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
            logger.info(f"Saved input video: {len(video_bytes)} bytes")

            # Build filter chain
            filter_strings = []
            for i, filter_config in enumerate(request.filters):
                filter_str = filter_config_to_ffmpeg(filter_config)
                if filter_str:
                    filter_strings.append(filter_str)
                    logger.info(f"Filter {i}: {filter_config.type} -> {filter_str}")

            if not filter_strings:
                # No valid filters, return original video
                logger.warning("No valid filters to apply, returning original video")
                output_base64 = base64.b64encode(video_bytes).decode("utf-8")
                return ApplyFiltersResponse(
                    video_base64=output_base64,
                    mime_type="video/mp4"
                )

            # Chain all filters
            filter_chain = ",".join(filter_strings)
            logger.info(f"Filter chain: {filter_chain}")

            output_path = os.path.join(tmpdir, "output.mp4")

            # Build ffmpeg command
            filter_cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-vf", filter_chain,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "copy",  # Copy audio without re-encoding
                "-movflags", "+faststart",
                output_path
            ]

            logger.info(f"Running ffmpeg with {len(filter_strings)} filters")
            result = subprocess.run(filter_cmd, capture_output=True, text=True)

            if result.returncode != 0:
                error_msg = get_ffmpeg_error(result.stderr)
                logger.error(f"ffmpeg filter failed: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"Failed to apply filters: {error_msg}")

            # Read output and return
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
