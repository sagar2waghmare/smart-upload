# Smart Upload — Cloudflare streaming gateway

This Worker moves the video-byte path away from Vercel:

Browser -> Cloudflare Worker -> Google Drive

It supports HTTP Range requests and streams the Drive response without buffering the movie in Worker memory.

## Free plan

Cloudflare Workers has a Free plan. Current documented limit is 100,000 Worker requests per day. Cloudflare documents no response-body size limit for Workers and supports streaming large responses without loading them into Worker memory.

## Worker secrets

Create these secrets:

- GOOGLE_SERVICE_ACCOUNT_JSON = the same Google service-account JSON used by Smart Upload
- PLAYBACK_SECRET = a long random secret

Use the same PLAYBACK_SECRET as Vercel CF_STREAM_SECRET.

## Vercel environment variables

- CF_STREAM_URL=https://smart-upload-stream.<your-subdomain>.workers.dev
- CF_STREAM_SECRET=<same value as Worker PLAYBACK_SECRET>

Without these variables, Smart Upload falls back to its existing /api/stream route.

## Deploy

From cloudflare-worker:

npx wrangler login
npx wrangler deploy

No R2 is required for this first phase.