# Smart Upload — Private Media Library

A polished private media-library website built with **Next.js 16**, **React 19** and **TypeScript**.

The visual direction is inspired by the ElegantFin streaming-library theme: dark cinematic palette, rounded cards, blur, soft shadows and responsive rails. All design and components are original — this project has no runtime dependency on Jellyfin or ElegantFin.

## Current stage

Fully functional frontend prototype with:

- ElegantFin-inspired cinematic dark UI with centralized design tokens
- Responsive hamburger menu, search overlay and upload URL flow
- Custom keyboard-accessible video player with seek, volume, speed, fullscreen and next/episode controls
- Movie / TV / anime filename detection and TMDB metadata service
- CloudShell upload URL integration via a secure server-side proxy route
- Clean AWS library API abstraction
- Favorites via localStorage, My Media page, settings integration dashboard
- All sensitive credentials stay server-side; only public variables reach the browser

## Getting started

```bash
cp .env.local .env.local
# Fill .env.local — see .env.example for variable names
npm install
npm run dev
```

## Environment variables

All variables are optional for the demo experience.  
See **`.env.example`** for the full list with descriptions.

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | client + server | `demo` or `real` |
| `AWS_LIBRARY_API_URL` | server | Library API base URL |
| `AWS_LIBRARY_API_KEY` | server | Library API secret |
| `CLOUDSHELL_UPLOAD_URL` | server | Upload pipeline endpoint |
| `CLOUDSHELL_API_KEY` | server | Upload pipeline secret |
| `TMDB_API_KEY` | server | TMDB v3 metadata API key |

## Architecture

```
Browser
  ├─ Smart Upload Next.js app (React 19 / App Router)
  │   ├─ /api/library       → AWS library proxy
  │   ├─ /api/play/[id]     → playback URL resolution
  │   ├─ /api/upload-url    → CloudShell upload proxy
  │   ├─ /api/identify      → filename → movie/tv/anime detection
  │   └─ /api/metadata      → TMDB metadata service
  └─ AWS / CloudShell / TMDB (server-side secrets stay server-side)
```

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint (Next.js flat config)
```
