import { NextResponse } from "next/server";
import { getValidatedDriveThumbnail } from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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
    const upstream = await getValidatedDriveThumbnail(safeId);
    if (!upstream?.ok || !upstream.body) {
      return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 404 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("cache-control", "private, max-age=3600, stale-while-revalidate=86400");
    headers.set("x-content-type-options", "nosniff");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(
      "[thumbnail] Google Drive thumbnail failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 502 });
  }
}
