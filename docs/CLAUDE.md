# Claude Code Preferences

## Project Overview
GenMedia is a node-based workflow UI for media generation. Users connect nodes to create video/image generation pipelines.

**Tech Stack:**
- Frontend: React, TypeScript, ReactFlow, Tailwind CSS
- Backend: Python, FastAPI, FFmpeg for video processing
- Storage: Firebase, Google Cloud Storage (GCS)

## Development Workflow

### After Making Changes
- **Web (Claude Code on web):** Always provide a PR link after pushing changes
- **VS Code:** No PR link needed, just commit and push

### PR Link Format
```
https://github.com/duckyducks-prog/genmediafrontend/pull/new/[branch-name]
```

### Commit Messages
- Use descriptive commit messages explaining the "why" not just the "what"
- Include context about what was broken and how it was fixed
- End with the Claude session URL

## Code Patterns

### Video Processing (Backend)
- Always use `run_ffmpeg_async()` for FFmpeg calls - never use blocking `subprocess.run()` in async endpoints
- Check if videos have audio streams before referencing `[0:a]` or `[1:a]` in FFmpeg filters
- Support both `_base64` and `_url` parameters for all media inputs (videos, images, audio)
- Add timeouts to FFmpeg commands to prevent hangs

### Node Execution (Frontend)
- Handle both URL and base64 inputs consistently:
```javascript
if (input.startsWith("data:")) {
  requestBody.xxx_base64 = input;
} else {
  requestBody.xxx_url = input;
}
```
- Use `crossOrigin="anonymous"` when loading media metadata from GCS URLs

### Error Handling
- Provide clear, user-friendly error messages
- Log detailed errors for debugging
- Handle missing audio/video streams gracefully

## UI Preferences

### Node Design
- Show helpful status indicators (durations, "will be trimmed", etc.)
- Color-code input handles for clarity (e.g., blue for base, purple for replacement)
- Add labels near handles explaining what each input expects
- Detect and display media durations automatically

### Feedback
- Show progress during long operations
- Display clear error messages in the node when something fails

## Common Issues & Fixes

### "Failed to fetch" Errors
Usually caused by:
1. Sending URL as base64 (add `_url` parameter support)
2. Auto-processing in useEffect (remove, wait for workflow execution)
3. Missing CORS headers (backend crashing before response)

### FFmpeg Error -22 (Invalid argument)
Usually caused by:
1. Referencing non-existent audio stream `[0:a]`
2. Odd dimensions (use `-2` instead of `-1` for scaling)
3. Invalid filter syntax

### API Hanging
Usually caused by:
1. Blocking `subprocess.run()` in async endpoints (use `asyncio.to_thread()`)
2. FFmpeg command hanging (add timeout)

## Testing
- Test with both data URLs and GCS URLs
- Test with videos that have and don't have audio
- Test edge cases (short videos, long videos, different aspect ratios)
