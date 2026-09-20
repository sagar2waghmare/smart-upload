import { NextResponse } from "next/server";
import { getMediaById } from "../../../../lib/library-service";
import { resolvePlaybackUrl } from "../../../../lib/playback";
import { validateDriveMedia } from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";
import { cloudflarePlaybackConfigured, createCloudflarePlaybackUrl } from "../../../../lib/cloudflare-playback";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;

  // Google Drive is now the production playback source. Validate the file
  // directly instead of rebuilding the full TMDB-enriched library on every play.
  if (await validateDriveMedia(id)) {
    const fastUrl = cloudflarePlaybackConfigured() ? createCloudflarePlaybackUrl(id) : null;
    return NextResponse.json({
      item: { id, kind: "movie", title: id, poster: null, backdrop: null, source: "google-drive" },
      demo: false,
      canPlay: true,
      defaultUrl: fastUrl ?? `/api/stream/${encodeURIComponent(id)}`,
    });
  }

  const item = await getMediaById(id);
  if (!item) return NextResponse.json({ error: "not-found", message: "Media not found" }, { status: 404 });
  if (item.mediaUrl) {
    const resolved = resolvePlaybackUrl(item.mediaUrl);
    return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
  }
  const resolved = resolvePlaybackUrl(item.mediaUrl);
  return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
}
