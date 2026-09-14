import { NextResponse } from "next/server";
import { getMediaById } from "../../../../lib/library-service";
import { driveMediaUrl, driveFetch } from "../../../../lib/google-drive";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

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
  const item = await getMediaById(id);
  if (!item) {
    return NextResponse.json({ error: "not-found", message: "Media not found" }, { status: 404 });
  }

  const driveUrl = driveMediaUrl(item.id);

  const forwardHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) forwardHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await driveFetch(driveUrl, forwardHeaders);
  } catch (err) {
    console.error("[stream] Drive fetch failed", err);
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
