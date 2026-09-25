import { createHmac } from "node:crypto";

function streamOrigin(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    // The streaming Worker expects the Drive file ID at pathname segment 1.
    // CF_STREAM_URL is therefore an origin, not a route/prefix URL.
    return parsed.origin;
  } catch {
    return "";
  }
}

export function cloudflarePlaybackConfigured(): boolean {
  return Boolean(streamOrigin(process.env.CF_STREAM_URL) && process.env.CF_STREAM_SECRET?.trim());
}

export function createCloudflarePlaybackUrl(fileId: string): string | null {
  const baseUrl = streamOrigin(process.env.CF_STREAM_URL);
  const secret = process.env.CF_STREAM_SECRET?.trim();
  const id = fileId.trim();
  if (!baseUrl || !secret || !id) return null;

  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const payload = `${id}:${exp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${baseUrl}/${encodeURIComponent(id)}?e=${exp}&s=${signature}`;
}
