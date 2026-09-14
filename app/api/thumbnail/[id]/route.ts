import { NextResponse } from "next/server";
import { getDriveThumbnail } from "../../../../../lib/google-drive";
import { requireSession, unauthorized } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "not-found" }, { status: 404 });

  try {
    const upstream = await getDriveThumbnail(id.trim());
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 404 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const cacheControl = upstream.headers.get("cache-control");
    if (contentType) headers.set("content-type", contentType);
    if (cacheControl) headers.set("cache-control", cacheControl);
    else headers.set("cache-control", "private, max-age=3600");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[thumbnail] Google Drive thumbnail failed", error);
    return NextResponse.json({ error: "thumbnail-unavailable" }, { status: 502 });
  }
}
