import { NextResponse } from "next/server";
import { getValidatedDriveThumbnail } from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const { id } = await params;
  const safeId = id?.trim();
  if (!safeId || safeId.length > 256) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const thumbnailResponse = await getValidatedDriveThumbnail(safeId);
    if (!thumbnailResponse?.ok || !thumbnailResponse.body) {
      return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 404 });
    }

    const headers = new Headers();
    const contentType = thumbnailResponse.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("cache-control", "private, max-age=3600, stale-while-revalidate=86400");
    headers.set("x-content-type-options", "nosniff");

    const response = new Response(thumbnailResponse.body, {
      status: 200,
      headers,
    });

    // Explicitly cache the already-authorized thumbnail response at the edge.
    // Authentication/Drive membership is still checked before this path runs.
    const cache = caches.default;
    const cacheUrl = new URL(req.url);
    cacheUrl.search = "";
    const cacheKey = new Request(cacheUrl.toString());
    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set("x-thumbnail-cache", "HIT");
      return hit;
    }

    const toCache = new Response(response.body, response);
    toCache.headers.set("cache-control", "s-maxage=86400, stale-while-revalidate=604800");
    await cache.put(cacheKey, toCache.clone());

    response.headers.set("x-thumbnail-cache", "MISS");
    return response;
  } catch (error) {
    console.error(
      "[thumbnail] Google Drive thumbnail failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 502 });
  }
}
