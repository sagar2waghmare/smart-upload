import { NextResponse } from "next/server";
import {
  drivePlaybackFetch,
  drivePreparedBrowserPlaybackFetch,
} from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const FORWARD_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export async function GET(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const { id } = await params;
  const requestUrl = new URL(req.url);
  const variant = requestUrl.searchParams.get("variant");
  const forwardHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) forwardHeaders.Range = range;
  const ifRange = req.headers.get("if-range");
  if (ifRange) forwardHeaders["If-Range"] = ifRange;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch) forwardHeaders["If-None-Match"] = ifNoneMatch;
  const ifModifiedSince = req.headers.get("if-modified-since");
  if (ifModifiedSince) forwardHeaders["If-Modified-Since"] = ifModifiedSince;
  // Video is already compressed; avoid content-coding transformations that can
  // interfere with byte-range playback and seeking.
  forwardHeaders["Accept-Encoding"] = "identity";

  let upstream: Response;
  try {
    upstream = variant === "browser"
      ? await drivePreparedBrowserPlaybackFetch(id, forwardHeaders)
      : await drivePlaybackFetch(id, forwardHeaders);
  } catch (err) {
    console.error("[stream] Drive playback validation failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(
      { error: "upstream-error", message: "Google Drive playback unavailable" },
      { status: 502 }
    );
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304 && upstream.status !== 416) {
    console.error("[stream] Google Drive upstream error", upstream.status);
    return NextResponse.json(
      { error: "upstream-error", message: "Google Drive playback unavailable" },
      { status: upstream.status }
    );
  }

  const responseHeaders = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }
  if (!responseHeaders.has("accept-ranges")) responseHeaders.set("accept-ranges", "bytes");
  // Keep authenticated byte ranges reusable in the browser without making
  // private media publicly cacheable at the edge.
  responseHeaders.set("cache-control", "private, max-age=300, stale-while-revalidate=60");
  responseHeaders.set("vary", "Range");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
