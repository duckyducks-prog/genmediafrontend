# HubSpot Gen Media Studio - PRD

**Version:** 1.1
**Date:** February 11, 2026
**Author:** Leticia De Bortoli

---

## Product Vision & Strategy

### The Problem

**For Creatives:** Current AI tools are fragmented and limited. To produce a single visual asset, they need to:
- Generate in one app, edit in another, upscale in a third
- Manually transfer files between each tool
- Hit hard limits (like 8 seconds per video) that force tedious workarounds
- Manually break scripts into chunks, write prompts for each, ensure frames align
- Repeat this tedious process for every project

**For Marketing Teams:** Non-technical team members can't use these tools effectively. They need pre-built workflows with the right prompts, model settings, and directions already configured.

### The Solution

Gen Media Studio is a visual, node-based workflow platform that lets users build AI-generated media pipelines once and run them repeatedly. Built internally, we pay only for API usage and run costs-- no subscriptions, no upcharges on credits, no limits we don't control.

---

## Target Users

**Video Creatives (Filmmakers, Editors, Motion Designers)**
- Generate B-roll, establishing shots, and filler footage
- Chain video segments with consistent style
- Need frame bridging (last frame -> first frame) for seamless cuts
- Use seed control to maintain visual consistency across a project
- Technical users comfortable with node-based tools (After Effects, DaVinci, Nuke)

**Visual Creatives (Graphic Designers, Art Directors, Photographers)**
- Generate and iterate on images quickly
- Apply modifiers: color grading, crop, resize for deliverables
- Need upscaling and background removal for production assets
- Technical users familiar with layer-based workflows (Photoshop, Figma)

**Marketing Teams (Brand Managers, Campaign Leads, Social Managers)**
- Use pre-built templates to create on-brand content
- Simple, guided workflows
- Require team-wide access to approved templates
- Focus on speed and consistency over creative control

---

## Core Value Proposition

| Pain Point | Gen Media Studio Solution |
|---|---|
| 8-second video limit | Workflow auto-chunks script, chains segments |
| Jumping between 5+ AI tools | All generations in one canvas |
| Manual file transfers | Data flows automatically between nodes |
| Rebuilding the same workflow daily | Save templates, run repeatedly |
| Inconsistent results across a project | Seed control + reference images |
| Non-creative teams can't use AI gen media tools effectively | Templates have prompts, models, directions pre-configured |
| Don't like the result, redo the process | Re-run individual nodes without restarting |

---

## Cost Advantage

This is an internally built tool. We pay for API usage, cloud storage & compute, and maintenance engineering.

| External Tools | Gen Media Studio |
|---|---|
| Per-seat subscriptions ($20-100/user/month) | No subscriptions |
| Credit systems that run out | Pay only for what we use |
| Rate limits and generation caps | Direct API access, negotiable limits |
| Features locked behind tiers | Build exactly what we need |
| Waiting for vendor roadmaps | Ship our own features |

**What we pay for:**
- Vertex AI API -- Per-generation cost (image, video, text)
- Cloud Storage (GCS) -- Media Asset storage
- Cloud Firestore -- Workflow storage
- Cloud Run -- Compute (scales to zero when idle)

**Where we save:**
- Monthly seats
- Credit top-ups
- Premium tier upgrades
- Features we don't use

**The flexibility advantage:**
- Build nodes for our specific workflows (Script -> 8-sec chunks -> Video chain)
- Add integrations we need (HubSpot File Manager, internal tools)
- No dependency on vendor feature releases
- Full control over model selection as new models launch

---

## Product Principles

| Principle | Helps Decide |
|---|---|
| Build Once, Run Forever | "Does this feature support reusability?" |
| Progressive Complexity | "Can marketing use this? Can creatives go deeper?" |
| Speed, Then Polish | "Does this reduce time spent iterating with AI?" |

- **Build Once, Run Forever** - Every workflow should be saveable and reusable
- **Progressive Complexity** - Simple for beginners, powerful for experts
- **Generate Fast, Then Polish** - Generate your assets fast, then focus your time on the real creative work

---

## Functional Requirements

### Epic 1: Workflow Creation -- "I want to visually build workflows so I can see exactly how my content will be processed."

| Story | Acceptance Criteria |
|---|---|
| I can add nodes to a canvas | Drag from the sidebar, node appears |
| I can connect nodes | Drag between connectors, the line appears |
| I can configure each node | Click the node, the settings panel opens |
| I can see my workflow clearly | Nodes are organized, connections visible |
| I can name nodes for clarity | Double-click to rename |
| I can add notes to explain | Sticky notes on canvas |

### Epic 2: Video Generation -- "I want to generate multiple consistent videos with one action so I can build all my assets before editing."

| Story | Acceptance Criteria |
|---|---|
| I can generate video from a prompt | Workflow returns video |
| I can generate multiple videos at once | Fan-out to multiple Generate nodes works |
| I can maintain style across all clips | Seed control produces consistent look |
| I can chain video segments | Last frame of clip A -> first frame of clip B |
| I can set format once, apply to all | Preset applies to multiple nodes |
| I can extend a video | Add more seconds to existing clip |
| I can extract frames for reference | Pull still from video |
| I can run workflow and walk away | All videos generate without babysitting |
| I can create storyboard frames | Generate images for each scene/shot |
| I can brainstorm visual concepts | Quick iterations on prompts to explore ideas |
| I can create alternate angles | Same subject, different camera positions |

### Epic 3: Image Generation -- "I want to generate, edit, and prepare images so I can get production-ready assets fast. I want to iterate on existing brand photography so I can create variations and extend my original assets."

| Story | Acceptance Criteria |
|---|---|
| I can generate images from a prompt | Gemini returns image |
| I can create images to be used in video generation | Generate image node connects to generate video node |
| I can use reference images | Style/subject references influence output |
| I can create variations of existing assets | Same subject, different compositions |
| I can swap elements in a photo | Inpainting replaces selected areas |
| I can adjust brightness, contrast, color | Modifier nodes apply in real-time |
| I can crop and resize for deliverables | Output matches spec (1080x1080, etc.) |
| I can remove backgrounds | Transparent PNG output |
| I can upscale for print/large format | 2x-4x resolution increase |
| I can batch process multiple images | Same edits applied to entire set |

### Epic 4: Templates & Reusability -- "I want to save and reuse workflows, so I don't rebuild the same thing for every project."

(All Users):

| Story | Acceptance Criteria |
|---|---|
| I can save my workflow as a template | "Save as Template" works |
| I can load my saved templates | Template browser shows my templates |
| I can use team/global templates | Admin templates visible to all users |
| I can save node settings as presets | Presets save and apply correctly |
| My work persists across tabs | Switching tabs doesn't lose workflow |
| I can apply settings to multiple nodes | Multi-select -> apply preset works |

### Epic 5: Quick Content Creation (Marketing Teams) -- "I want to use pre-built templates so I can create on-brand fast, and use AI media generation tools without a big learning curve."

| Story | Acceptance Criteria |
|---|---|
| I can browse official templates | Global templates shown prominently |
| I can generate content in a few clicks | Load template -> fill inputs -> run |
| I can swap out images/prompts easily | Input nodes are clearly labeled |
| I can download final assets | Export to common formats works |
| I don't need to understand node logic | Workflow runs without configuration |

### Epic 6: Asset Management (All Users) -- "I want to organize my generated content so I can find and reuse it across projects."

| Story | Acceptance Criteria |
|---|---|
| Generated content auto-saves | Assets appear in library |
| I can organize into folders | Create, rename, nest folders |
| I can search my assets | Search by name returns results |
| I can bulk manage | Multi-select, delete, move works |
| I can drag assets into workflows | Drag from library to canvas |

### Epic 7: Workflow Execution (All Users) -- "I want to run my workflow and see progress so I know what's happening."

| Story | Acceptance Criteria |
|---|---|
| I can run my workflow | Click "Run", execution starts |
| I can see which node is processing | Visual indicator on active node |
| I can see results as they complete | Output displays in node |
| I can cancel if needed | Cancel button stops execution |
| I can retry on failure | Error shows retry option |
| I can undo mistakes | Cmd+Z reverses last action |

---

## Nonfunctional Requirements

### Performance

| Requirement | Target | Notes |
|---|---|
| Image generation latency | < 15 seconds | Gemini API call + save to library |
| Text generation latency | < 3 seconds | Gemini 2.0 Flash response time |
| Video generation latency | < 120 seconds | Veo 3.1 async operation, polled every 5s |
| Workflow canvas responsiveness | 60 fps | ReactFlow rendering with up to 50 nodes |
| Page load time (initial) | < 3 seconds | Measured on standard broadband connection |
| API response time (non-generation) | < 500ms | CRUD operations for assets, workflows |

### Scalability

| Requirement | Target | Notes |
|---|---|
| Concurrent users | 50+ simultaneous | Cloud Run auto-scaling (0-10 frontend, 0-5 backend instances) |
| Workflows per user | No hard limit | Firestore document storage scales automatically |
| Assets per user | No hard limit | GCS storage scales automatically |
| Batch processing | 10+ items per batch | ScriptQueue nodes support multiple prompt inputs |
| Video processing throughput | Multiple concurrent FFmpeg jobs per instance | Backend instances allocated 2 CPU cores, 1 GB RAM |

### Availability & Reliability

| Requirement | Target | Notes |
|---|---|
| Uptime target | 99.5% | Aligned with Cloud Run SLA |
| Graceful degradation | Required | If one AI model is down, other node types still work |
| Auto-recovery | Required | Cloud Run restarts failed containers automatically |
| Data durability | 99.999% | GCS and Firestore built-in replication |
| Health monitoring | Required | `/health` endpoint checks Firestore and GCS connectivity |
| Execution resilience | Required | Workflow execution continues on non-critical node failures |

### Security

| Requirement | Target | Notes |
|---|---|
| Authentication | Firebase Auth (email/password) | Migrating to Okta + IAP in Phase 4 |
| Authorization | Email and domain allowlisting | Configurable per environment via env vars |
| Data isolation | User-scoped | Assets stored at `users/{user_id}/` in GCS; Firestore queries filtered by `user_id` |
| Transport encryption | TLS/HTTPS | All traffic encrypted in transit; Cloud Run enforces HTTPS |
| CORS policy | Restrictive origin whitelist | Only known frontend origins allowed |
| Input validation | Enforced on all endpoints | Pydantic models with size limits (prompt: 10K chars, image: 50MB, video: 150MB) |
| Secret management | Environment variables | Migrating to GCP Secret Manager in Phase 4 |
| Credential storage | Excluded from source | `.gitignore` blocks `serviceAccountKey.json` and `.env` files |
| Access logging | Request tracing | X-Request-ID middleware for distributed tracing |
| Security reviews | Required before production deploy | Part of Phase 2 milestone |

### Usability

| Requirement | Target | Notes |
|---|---|
| Learning curve (Marketing) | Productive within 1 session | Via pre-built templates and guided workflows |
| Learning curve (Creatives) | Productive within 3 sessions | Familiarity with node-based tools assumed |
| Accessibility | WCAG 2.1 AA | Keyboard navigation, screen reader support for core flows |
| Browser support | Chrome, Edge, Firefox (latest 2 versions) | WebGL required for PixiJS filter previews |
| Responsive design | Desktop-first (1280px+) | Node canvas optimized for large screens |
| Error messaging | User-friendly | Clear messages with retry options; technical details logged server-side |
| Undo/Redo | Required | Cmd+Z / Cmd+Shift+Z for canvas actions |

### Compliance & Data Governance

| Requirement | Target | Notes |
|---|---|
| Data residency | US (us-central1) | GCP resources hosted in US region |
| AI content labeling | Per Google AI Terms of Service | Generated content must comply with Google's acceptable use policies |
| Data retention | User-controlled | Users can delete their own assets and workflows |
| PII handling | Minimal | Only email address stored for auth; no other PII collected |
| Audit trail | Basic | Firestore timestamps on create/update; request tracing via X-Request-ID |

### Maintainability

| Requirement | Target | Notes |
|---|---|
| Code quality score | 8.0+ / 10 | Current: 8.2/10 per backend evaluation |
| Test coverage (backend) | 80%+ | Current: ~80% via pytest-cov; 63 E2E tests |
| Test coverage (frontend) | 70%+ | Vitest unit tests; manual E2E testing |
| API versioning | Required | All endpoints use `/v1/` prefix |
| Deployment automation | Required | Cloud Build CI/CD pipelines for both frontend and backend |
| Environment separation | Required | Dev and prod use separate Firestore collections and GCS paths |
| Documentation | Architecture docs, API docs (OpenAPI/Swagger), development guide | Maintained in `/docs` directory |

---

## Technical Architecture

### System Overview

```
+-------------------------------------------------------------+
|                         Frontend                             |
|  React 18 + TypeScript + Vite 7                             |
|  Node-based workflow canvas (ReactFlow 11)                   |
|  WebGL filter preview (PixiJS 8)                             |
|  Firebase Auth SDK                                           |
+--------------------------+----------------------------------+
                           |
                           | HTTPS + Firebase ID Token
                           |
+--------------------------v----------------------------------+
|                      Backend API                             |
|  FastAPI (Python 3.11+, async)                               |
|  27 REST endpoints across 6 router modules                   |
|  Firebase Admin SDK for auth verification                    |
|  FFmpeg for video/audio processing                           |
+---------+----------------+------------------+---------------+
          |                |                  |
+---------v------+  +------v--------+  +------v--------------+
|   Firestore    |  | Cloud Storage |  | Google AI APIs       |
|   (NoSQL)      |  | (GCS)         |  |                      |
| - Workflows    |  | - User assets |  | - Gemini 3 Pro Image |
| - Asset        |  | - Generated   |  | - Veo 3.1            |
|   metadata     |  |   media       |  | - Gemini 2.0 Flash   |
|                |  |               |  | - Imagen 4.0 Upscale |
|                |  |               |  | - Lyria 002          |
+----------------+  +---------------+  +----------------------+
```

### Technology Stack

**Frontend:**
- React 18, TypeScript, Vite 7
- ReactFlow 11 (node-based visual workflow canvas)
- Tailwind CSS 3.4 + Radix UI primitives
- PixiJS 8 (WebGL-accelerated image filter preview)
- TanStack React Query (server state management)
- Firebase SDK 12.7 (authentication)

**Backend:**
- Python 3.11+, FastAPI, uvicorn
- Firebase Admin SDK 13.6 (token verification)
- Google GenAI SDK 1.55+ (Vertex AI client for all AI model calls)
- FFmpeg (video/audio processing via async subprocess)
- Pillow, CairoSVG (image processing)
- ElevenLabs SDK 1.50 (voice changing)
- Pydantic 2.12+ (request/response validation)
- httpx (async HTTP client)

**Infrastructure:**
- Google Cloud Run (containerized, auto-scaling, scales to zero)
- Google Cloud Build (CI/CD)
- Docker (multi-stage builds)
- Google Cloud Storage (media asset storage)
- Cloud Firestore (workflow and asset metadata)
- Firebase Authentication (email/password, migrating to Okta)

### AI Models

| Model | Use Case | Endpoint | Output |
|---|---|---|---|
| Gemini 3 Pro Image | Image generation | `global` | Base64 PNG, up to 2K |
| Veo 3.1 | Video generation | `us-central1` | Async -> MP4 URL, 4-8 sec |
| Gemini 2.0 Flash | Text generation | `us-central1` | Streaming text |
| Imagen 4.0 Upscale | Image upscaling | `us-central1` | 2x/4x PNG/JPEG |
| Lyria 002 | Music generation | `us-central1` | Base64 WAV, 30 sec |

### Node Types (30+)

- **Input:** ImageInput, VideoInput, Prompt, ScriptQueue
- **Output:** TextOutput, ImageOutput, VideoOutput, Preview, Download
- **Generators:** GenerateImage, GenerateVideo, GenerateMusic, LLM
- **Image Modifiers:** BrightnessContrast, Blur, Sharpen, HueSaturation, Noise, FilmGrain, Vignette, Crop, ImageComposite
- **Video Processing:** ExtractLastFrame, VideoWatermark, VideoSegmentReplace, MergeVideos, AddMusicToVideo
- **Text Processing:** PromptConcatenator, TextIterator
- **Audio:** VoiceChanger
- **Utility:** StickyNote, Compound (reusable sub-workflows)

### Workflow Execution Engine

1. **Dependency analysis** -- Builds a directed acyclic graph (DAG) from node connections
2. **Level grouping** -- Groups nodes by execution level; independent nodes at the same level can run concurrently
3. **Asset resolution** -- Converts asset IDs to data URLs before execution
4. **Sequential level processing** -- Executes each level in order; nodes within a level run in parallel
5. **Output propagation** -- Passes outputs from completed nodes to downstream nodes
6. **Error recovery** -- Continues execution on non-critical failures; surfaces errors per-node

### Deployment Architecture

| Service | Container | Resources | Scaling |
|---|---|---|---|
| Frontend | Node.js 20 Alpine + Express | 512 MB RAM, 1 CPU | 0-10 instances |
| Backend | Python 3.11 slim + FFmpeg | 1 GB RAM, 2 CPUs | 0-5 instances |

- **Environments:** Dev and Prod with separate Firestore collections, GCS paths, and CORS origins
- **CI/CD:** Google Cloud Build with automated build, push, and deploy steps
- **Timeout:** Backend requests up to 300 seconds (for long video operations)

---

## In Scope vs. Out of Scope

### In Scope (v1.0)

- Visual node-based workflow builder (canvas, connections, configuration panels)
- AI image generation (Gemini 3 Pro Image) with reference images and style control
- AI video generation (Veo 3.1) with first/last frame conditioning and chaining
- AI text generation (Gemini 2.0 Flash) for scripts and prompt refinement
- Image upscaling (Imagen 4.0, 2x/4x)
- Music generation (Lyria 002)
- Video processing (merge, add music, watermark, segment replace, filters)
- Image filters (brightness, contrast, blur, sharpen, HSL, noise, film grain, vignette, crop)
- Voice changing (ElevenLabs)
- Workflow save, load, clone, and template management
- Asset library (auto-save, organize, search, bulk manage)
- User authentication (Firebase email/password with allowlisting)
- Batch execution via ScriptQueue nodes
- Export/download of generated assets
- Real-time execution progress indicators
- Undo/redo on canvas

### Out of Scope (v1.0)

- Real-time multi-user collaboration on the same workflow (planned for future)
- Public template marketplace or community sharing
- Mobile or tablet-optimized interface
- Direct integration with third-party tools (Adobe Creative Cloud, Canva, etc.)
- HubSpot File Manager integration (planned for future)
- User billing, usage metering, or chargeback dashboards
- Custom model training or fine-tuning
- On-premise deployment
- Offline mode
- Audio-only generation workflows (music/voice without video context)
- Advanced video editing (timeline-based editing, transitions beyond cuts)
- User roles and granular permissions beyond admin/user
- SSO via Okta (planned for Phase 4; Firebase Auth used for v1.0)
- GPU-accelerated video processing (CPU-only FFmpeg for v1.0)

---

## Milestones

| Phase | Dates | Activities |
|---|---|---|
| 1: Refactor | 2/16 - 2/27 | Code refactor for scalability; Comprehensive testing; Access provisioning |
| 2: Deploy | 3/3 - 3/27 | Security Reviews; CI/CD; Deployment to GCP; Develop alpha rollout plans |
| 3: Alpha Launch | 3/30 - 5/1 | Roll out to small group of users; Gather feedback; Bug fixes |
| 4: Refine based on User Feedback | 5/4 - 5/29 | Implement prioritized features from alpha feedback; Scalability |
| 5: Beta Launch | 6/1 | Roll out to additional testers throughout marketing |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Spend control** -- AI generation costs could escalate unpredictably with increased usage, especially video generation (Veo) which is the most expensive per-call | Medium | High | Implement per-user and per-team usage quotas; add spend alerting via GCP budget alerts; monitor cost per generation type; consider caching or reuse of common generations |
| **Rate limiting** -- Google AI API rate limits could throttle generation during peak usage, causing failed or queued workflows | Medium | Medium | Implement exponential backoff with retry logic (already in place for generation calls); request quota increases from Google as usage grows; add user-facing queue indicators; distribute load across time |
| **Video processing resource consumption** -- FFmpeg operations are CPU-intensive and can strain Cloud Run instances, especially for long videos or concurrent jobs | Medium | Medium | Allocate 2-CPU instances for backend; set FFmpeg timeouts (300s default); monitor container CPU/memory; evaluate GPU-enabled instances (NVIDIA) if demand increases; implement job queuing for heavy operations |
| **Latency** -- Video generation takes 60-120 seconds per clip; complex workflows with many nodes could take 5+ minutes, frustrating users | High | Medium | Async execution with polling; parallel node execution at same dependency level; clear progress indicators; allow users to navigate away and return; optimize node-level caching |
| **Model availability and deprecation** -- Google AI models are in preview; model names, capabilities, or availability could change without notice | Medium | High | Abstract model names into configuration (already done in `config.py`); monitor Google AI release notes; maintain fallback model options; test against model updates in dev before prod |
| **Security -- authentication migration** -- Firebase Auth is a temporary solution; migration to Okta + IAP introduces risk of auth downtime or integration issues | Low | High | Plan migration during low-usage period; maintain Firebase as fallback during transition; thorough testing in staging environment; phased rollout |
| **Large payload handling** -- Base64-encoded media (up to 150 MB for video) can cause memory pressure on Cloud Run containers | Medium | Medium | Enforce payload size limits via Pydantic validation; monitor container memory usage; consider streaming uploads to GCS instead of base64 for large files |
| **Single point of failure -- GCP region** -- All services deployed in `us-central1`; a regional outage would take down the entire application | Low | High | Accept risk for v1.0; evaluate multi-region deployment for future phases if uptime requirements increase |
| **Browser compatibility** -- WebGL (PixiJS) required for filter previews; older browsers or restricted corporate environments may not support it | Low | Low | Graceful fallback to server-side filter processing; document browser requirements; target latest 2 versions of Chrome, Edge, Firefox |
| **Team dependency** -- Small engineering team; knowledge concentrated in few individuals | Medium | Medium | Maintain documentation (architecture docs, CLAUDE.md, code evaluation reports); use clear code patterns and conventions; onboard additional engineers during Phase 4 |

---

## Outstanding Questions

| # | Question | Owner | Status | Notes |
|---|---|---|---|---|
| 1 | What are the per-user and per-team spend limits for AI generation? | Product / Finance | Open | Needed before alpha launch to configure usage quotas |
| 2 | What is the target Google AI API quota, and have increases been requested? | Engineering | Open | Current default quotas may not support 50+ concurrent users |
| 3 | What is the timeline and plan for Firebase Auth -> Okta + IAP migration? | Engineering / IT | Open | Blocked on company infrastructure decisions (Phase 4) |
| 4 | Will the tool be deployed to a company-owned GCP account or remain on the current account? | Engineering / IT | Open | Affects security review, billing, and compliance |
| 5 | What are the brand guidelines and approved templates for Marketing team use? | Brand / Marketing | Open | Needed to pre-build Epic 5 templates |
| 6 | Should generated content be automatically watermarked or labeled as AI-generated? | Legal / Brand | Open | May be required by company policy or Google AI terms |
| 7 | What is the data retention policy for generated assets? | Legal / IT | Open | Affects storage costs and compliance |
| 8 | Is there a need for audit logging beyond request tracing (e.g., who generated what, when)? | Security / Compliance | Open | May be required for company compliance |
| 9 | What is the rollback plan if a Google AI model is deprecated or breaks during preview? | Engineering | Open | Need documented fallback models and switchover process |
| 10 | Will the tool need to support HubSpot File Manager integration for asset delivery? | Product | Open | Listed as a future integration; needs scoping |
| 11 | What are the specific video format and resolution requirements for marketing deliverables? | Marketing | Open | Determines default presets for Epic 5 templates |
| 12 | How will user feedback be collected and prioritized during alpha? | Product | Open | Needed before Phase 3 alpha launch |

---

## Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| **Adoption** -- Active users during alpha | 10+ weekly active users | Firebase Auth login events |
| **Adoption** -- Active users during beta | 30+ weekly active users | Firebase Auth login events |
| **Efficiency** -- Time to create a video asset | 50% reduction vs. manual multi-tool workflow | User survey + task timing during alpha |
| **Reusability** -- Templates created and reused | 5+ shared templates in active use by beta | Firestore workflow query (is_public = true) |
| **Satisfaction** -- User satisfaction score | 4.0+ / 5.0 | Post-session survey during alpha and beta |
| **Reliability** -- Workflow success rate | 90%+ workflows complete without user-facing errors | Application logging + error tracking |
| **Cost** -- Average cost per generation | Track and trend downward | GCP billing reports by API |
| **Engagement** -- Workflows created per user per week | 3+ | Firestore workflow creation events |
| **Retention** -- Week-over-week return rate | 60%+ during alpha | Firebase Auth session data |

---

## Dependencies

| Dependency | Type | Owner | Risk if Unavailable |
|---|---|---|---|
| Google Vertex AI APIs (Gemini, Veo, Imagen, Lyria) | External service | Google Cloud | Core generation features blocked; no fallback |
| Google Cloud Run | Infrastructure | Google Cloud | Application unavailable; mitigated by GCP SLA |
| Google Cloud Firestore | Infrastructure | Google Cloud | Workflow and asset persistence unavailable |
| Google Cloud Storage | Infrastructure | Google Cloud | Media asset storage unavailable |
| Firebase Authentication | External service | Google / Firebase | Users cannot log in; mitigated by Okta migration plan |
| ElevenLabs API | External service | ElevenLabs | Voice changing feature unavailable; non-critical |
| FFmpeg | Open-source library | Community | Video processing features unavailable; bundled in Docker image |
| Company GCP account (future) | Infrastructure | IT / Engineering | Delays migration to company-owned infra; current account continues |
| Security review approval | Process | Security team | Blocks Phase 2 production deployment |

---

## Glossary

| Term | Definition |
|---|---|
| **Node** | A single processing step in a workflow (e.g., Generate Image, Apply Filter, Merge Videos). Represented as a draggable block on the canvas. |
| **Edge / Connection** | A link between two nodes that defines how data flows from one node's output to another's input. |
| **Workflow** | A complete pipeline of connected nodes that performs a media generation or processing task from start to finish. |
| **Template** | A saved workflow that can be loaded and reused. Can be personal, team, or global. |
| **Preset** | Saved configuration for a single node (e.g., specific model settings, filter values). |
| **Canvas** | The visual workspace where users build workflows by placing and connecting nodes. |
| **Fan-out** | A pattern where one node's output connects to multiple downstream nodes for parallel processing. |
| **Frame bridging** | Using the last frame of one video clip as the first frame of the next to ensure visual continuity. |
| **Seed control** | Setting a fixed random seed so that repeated generations produce visually consistent results. |
| **ScriptQueue** | A node type that takes multiple text inputs and runs the downstream workflow once for each input (batch processing). |
| **DAG** | Directed Acyclic Graph -- the data structure representing node dependencies in a workflow. Ensures execution order. |
| **Compound node** | A reusable sub-workflow packaged as a single node. |
| **GCS** | Google Cloud Storage -- object storage service used for media assets. |
| **Firestore** | Google Cloud Firestore -- NoSQL document database used for workflows and asset metadata. |
| **Cloud Run** | Google Cloud Run -- serverless container platform that auto-scales and scales to zero. |
| **Veo** | Google's video generation AI model (currently Veo 3.1). |
| **Gemini** | Google's multimodal AI model family, used for image generation (Gemini 3 Pro Image) and text generation (Gemini 2.0 Flash). |
| **Imagen** | Google's image model, used here specifically for upscaling (Imagen 4.0). |
| **Lyria** | Google's music generation AI model (Lyria 002). |
| **PixiJS** | WebGL-based rendering library used in the frontend for real-time image filter previews. |
| **ReactFlow** | React library for building interactive node-based UIs, powering the workflow canvas. |
