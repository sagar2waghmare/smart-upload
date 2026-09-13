import { NextResponse } from "next/server";
import { getMediaById } from "../../../../lib/library-service";
import { resolvePlaybackUrl } from "../../../../lib/playback";
import { requireSession, unauthorized } from "../../../../lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;
  const item = await getMediaById(id);
  if (!item) return NextResponse.json({ error: "not-found", message: "Media not found" }, { status: 404 });
  const resolved = resolvePlaybackUrl(item.mediaUrl);
  return NextResponse.json({
    item,
    demo: resolved.demo,
    canPlay: resolved.canPlay,
    defaultUrl: resolved.url,
  });
}