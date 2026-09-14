import { NextResponse } from "next/server";
import { drivePlaybackFetch } from "../../../../lib/google-drive-playback";
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
  const forwardHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) forwardHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await drivePlaybackFetch(id, forwardHeaders);
  } catch (err) {
    console.error("[stream] Drive playback validation failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(
      { error: "upstream-error", message: "Google Drive playback unavailable" },
      { status: 502 }
    );
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
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
  // Allow the browser to reuse media byte ranges briefly. The URL is still
  // protected by Firebase auth, and Google Drive remains the source of truth.
  responseHeaders.set("cache-control", "private, max-age=60, stale-while-revalidate=30");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
