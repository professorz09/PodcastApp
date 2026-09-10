# DebateForge — AI Video Generator

## Project Overview
An AI-powered platform (branded **DebateForge**) for generating debate/conversational-style videos from YouTube, Instagram, Reddit, or custom scripts. Supports multiple video styles (Debate, Explained, Situational, Podcast Panel, Context Analyst), a Song/Lyrics Studio, and 16:9 YouTube-style video export. Uses Gemini for script/image generation, ElevenLabs for TTS, and Google Cloud STT for transcription.

Single-user app, no login gate: the one active project is persisted entirely locally in the browser's IndexedDB — nothing is synced to a server or across devices.

## Toast Notification System
- All `alert()` calls have been replaced with `toast.*` notifications (see `components/Toast.tsx`)
- `toast.error()`, `toast.success()`, `toast.warning()`, `toast.info()` — auto-dismiss after 4.5s
- `<ToastContainer />` is mounted at root in `App.tsx`
- Import via: `import { toast } from './Toast';` (within components/) or `../components/Toast` (from services/)

## Architecture
- **Frontend**: React 19 + TypeScript + Vite, styled with Tailwind CSS
- **Local dev backend**: Express server (TypeScript, run via `tsx`) serves both API routes and the Vite dev middleware, sharing port 5000. Its `/api/*` routes call Vertex/Gemini, ElevenLabs, Google Cloud directly (via `services/vertexProxy.ts` etc.) and proxy the Flask routes to `localhost:8000`.
- **Production (Replit)**: the `[deployment]` target in `.replit` runs the same Express server (`start.sh` → `npm start` → `tsx server.ts`) on the Replit VM, so production uses the exact same `/api/*` routes as local dev.
- **Production (Vercel, optional)**: `vercel.json` builds the static frontend and rewrites the Flask/Render routes (`/api/youtube|video|files|instagram|cookies|reddit|shorts|health`); everything else under `/api/gemini`, `/api/gemini/key-check`, `/api/google/*`, `/api/elevenlabs/*` is served by the matching file under `api/` (Vercel Node.js Serverless Functions, file-based routing — one file per route, no framework). Each one re-imports the same `services/vertexProxy.ts` logic the Express routes use, so behavior is identical between the two deploy targets. Configure the same env vars as `.env.example` as Vercel project secrets (Project Settings → Environment Variables) — paste `GCP_SA_KEY`'s service-account JSON as a single-line secret value, same as locally.
- **Persistence**: The single active project (script, storyboard/shorts scenes+images, audio, thumbnail) is stored entirely in the browser's IndexedDB via `services/storageService.ts` — no server-side database, no cross-device sync.
- **Auth**: none. The app loads straight into the project on open.

## Key Files
- `server.ts` — Express server with API proxy routes (Gemini/Vertex, ElevenLabs, Google Cloud, Flask), used for local dev and Replit VM production
- `api/` — Vercel Serverless Functions mirroring the same proxy routes (`gemini.ts`, `gemini/key-check.ts`, `google/speech-to-text.ts`, `google/text-to-speech.ts`, `google/operations.ts`, `elevenlabs/tts.ts`, `elevenlabs/voices.ts`), used only when deployed on Vercel
- `App.tsx` — Main React component managing app state flow
- `vite.config.ts` — Vite config (port 5000, host 0.0.0.0, allowedHosts: all)
- `components/` — React UI components (DebateInput, ScriptEditor, AudioGenerator, ThumbnailGenerator, DebateVisualizer, YoutubeImporter, Layout, Storyboard, Shorts, ShortsStudio)
- `services/` — Client-side services (geminiService, elevenLabsService, googleCloudService, storageService, audioUtils, canvasRenderer, videoRenderer, storyboardGenJobs)
- `types.ts` — Shared TypeScript types

## Instagram Import (Python, port 8000)
- `/api/instagram/info` — Get post metadata (title, uploader, thumbnail, description) via yt-dlp
- `/api/instagram/download` — Download Instagram video/reel (background job with progress polling)
- `/api/instagram/download/status/<job_id>` — Poll download progress
- `/api/instagram/comments` — Scrape comments using instaloader (public posts only; private needs cookies)
- Cookies: same `yt_cookies.txt` file used for both YouTube and Instagram auth
- Frontend: `components/InstagramImporter.tsx`

## App Flow
1. YouTube Import (optional) — import transcript from a YouTube video
1b. Instagram Import (optional) — download video/reel, scrape comments, attach to script context
2. Input — configure debate topic, speakers, style, duration
3. Script — review and edit the generated script
4. Thumbnail — generate a thumbnail image
5. Audio — generate TTS audio for each segment
6. Visualizer — render the final video

## Environment Variables Required
See `.env.example` for full details. Set locally in `.env` (read by `server.ts` for both dev and production):
- `GCP_SA_KEY` + `GCP_PROJECT_ID` (+ optional `GCP_REGION`) — Vertex AI Service Account, preferred Gemini backend
- `GEMINI_API_KEY` — direct Gemini API (AI Studio) key; used when Vertex isn't configured, AND as an automatic fallback when Vertex hits a quota error (separate quota pool from Vertex)
- `ELEVENLABS_API_KEY` — ElevenLabs API key (for text-to-speech)
- `GOOGLE_CLOUD_API_KEY` — Google Cloud API key (for speech-to-text transcription)

## Flask Server (Python, port 8000)
- `flask_server.py` — YouTube transcript/comments (youtube-transcript-api), video download (yt-dlp + ffmpeg), video edit (ffmpeg), Instagram video download + comment scraping (yt-dlp + instaloader)
- Express proxies `/api/youtube`, `/api/video`, `/api/files`, `/api/health`, `/api/instagram` → Flask
- Download progress tracked in real-time via `subprocess.Popen` + yt-dlp `--newline` flag
- Workflow: "Flask Server" → `python flask_server.py` → port 8000 (internal)
- `/api/video/edit` supports per-segment zoom/pan (each cut `{start,end,zoom?,pan_x?,pan_y?}`)
- `pad_filter` (black_bars) is separate from `vf_filter` to avoid double-applying zoom in concat mode

## YouTube Import → Context Flow
- After transcript/comments are fetched, "→ Script Context mein Bhejo" button sends content to DebateInput
- `YoutubeImportData.contextFileContent` + `contextFileName` carry the payload
- `DebateInput` accepts `initialContextContent` + `initialFileName` props and pre-fills the Context / Research section

## Development
- Run: `npm run dev` (starts `tsx server.ts` on port 5000)
- Build: `npm run build` (Vite build to `dist/`)
- Workflow: "Start application" → `npm run dev` → port 5000 (webview)
