import { createHmac } from "node:crypto";

const trim = (value: string | undefined) => value?.trim().replace(/\/$/, "") ?? "";

export function cloudflarePlaybackConfigured(): boolean {
  return Boolean(trim(process.env.CF_STREAM_URL) && process.env.CF_STREAM_SECRET);
}

export function createCloudflarePlaybackUrl(fileId: string): string | null {
  const baseUrl = trim(process.env.CF_STREAM_URL);
  const secret = process.env.CF_STREAM_SECRET?.trim();
  const id = fileId.trim();
  if (!baseUrl || !secret || !id) return null;

  // Short-lived URL: the browser can use it for all HTTP Range requests
  // for this playback session without exposing Google credentials.
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const payload = `${id}:${exp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${baseUrl}/${encodeURIComponent(id)}?e=${exp}&s=${signature}`;
}
