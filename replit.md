# AutoVid AI - Audio to Video Sync

## Project Overview
A React + Express web application that generates debate-style video content using AI. It uses Gemini for script generation, ElevenLabs for text-to-speech, and Google Cloud Speech-to-Text for transcription.

## Architecture
- **Frontend**: React 19 + TypeScript + Vite, styled with Tailwind CSS
- **Backend**: Express server (TypeScript, run via `tsx`) serving both API routes and the Vite dev middleware
- **Single port**: Frontend and backend share port 5000 (Express serves Vite in dev mode, static `dist/` in production)

## Key Files
- `server.ts` — Express server with API proxy routes for ElevenLabs and Google Cloud
- `App.tsx` — Main React component managing app state flow
- `vite.config.ts` — Vite config (port 5000, host 0.0.0.0, allowedHosts: all)
- `components/` — React UI components (DebateInput, ScriptEditor, AudioGenerator, ThumbnailGenerator, DebateVisualizer, YoutubeImporter, Layout)
- `services/` — Client-side services (geminiService, elevenLabsService, googleCloudService, storageService, audioUtils, canvasRenderer, videoRenderer)
- `types.ts` — Shared TypeScript types

## App Flow
1. YouTube Import (optional) — import transcript from a YouTube video
2. Input — configure debate topic, speakers, style, duration
3. Script — review and edit the generated script
4. Thumbnail — generate a thumbnail image
5. Audio — generate TTS audio for each segment
6. Visualizer — render the final video

## Environment Variables Required
- `GEMINI_API_KEY` — Google Gemini API key (for script/thumbnail generation)
- `ELEVENLABS_API_KEY` — ElevenLabs API key (for text-to-speech)
- `GOOGLE_CLOUD_API_KEY` — Google Cloud API key (for speech-to-text transcription)

## Flask Server (Python, port 8000)
- `flask_server.py` — YouTube transcript/comments (youtube-transcript-api), video download (yt-dlp + ffmpeg), video edit (ffmpeg)
- Express proxies `/api/youtube`, `/api/video`, `/api/files`, `/api/health` → Flask
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
