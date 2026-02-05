# Claude Code Preferences


## Project Overview
GenMedia is a full-stack AI-powered media generation platform. Users connect nodes in a workflow UI to create video/image/text generation pipelines.

**Tech Stack:**
- Frontend: React, TypeScript, Vite, ReactFlow, Tailwind CSS
- Backend: Python 3.11+, FastAPI, FFmpeg for video processing
- Storage: Firebase, Google Cloud Storage (GCS)
- Deployment: Google Cloud Run, Docker, Cloud Build


## Development Workflow

- Use feature branches for all work. Submit PRs for review.
- Use descriptive commit messages explaining the "why" and "what".
- After pushing, provide a PR link if working on the web.
- For local VS Code, just commit and push.

**PR Link Format:**
```
https://github.com/duckyducks-prog/genmediafrontend/pull/new/[branch-name]
```


## Environment & Deployment

- Use `.env.development` and `.env.production` for backend config. Example templates: `.env.development.example`, `.env.production.example`.
- Use `.env.local` for frontend local dev, and set env vars via Cloud Build for deployed environments. Example: `.env.local.example`.
- Deploy using unified `scripts/deploy.sh` in both backend and frontend. Script will prompt for dev or prod.
- See `README.md` and `ENVIRONMENT_STRATEGY.md` for details.

## Code Patterns


### Video Processing (Backend)
- Always use `run_ffmpeg_async()` for FFmpeg calls—never use blocking `subprocess.run()` in async endpoints
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
- Always use `VITE_API_BASE_URL` (from env) for API calls—never hardcode backend URLs.


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
4. Frontend hitting the wrong backend (check `VITE_API_BASE_URL` and deployment environment)

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
- Test both dev and prod deployments to ensure environment separation and CORS are correct
