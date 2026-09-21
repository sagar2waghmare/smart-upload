import { NextResponse } from "next/server";
import { getLibrary, getMediaById } from "../../../../lib/library-service";
import { resolvePlaybackUrl } from "../../../../lib/playback";
import { findPreparedAudioTracks, findPreparedBrowserMedia, getDriveMediaMimeType, validateDriveMedia } from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";
import { cloudflarePlaybackConfigured, createCloudflarePlaybackUrl } from "../../../../lib/cloudflare-playback";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;

  // Resolve metadata from the library first. This preserves movie/series/anime
  // classification and grouped episode metadata for Drive-backed playback.
  const libraryItem = await getMediaById(id);
  if (await validateDriveMedia(id)) {
    if (libraryItem) {
      const preparedId = await findPreparedBrowserMedia(id);
      // Sidecar AAC tracks are independent of the browser MP4 copy, so discover
    // them even when playback falls back to the original source.
      const audioTracks = await findPreparedAudioTracks(id);
      const sourceType = preparedId ? "video/mp4" : await getDriveMediaMimeType(id);
      const browserId = preparedId ?? id;
      const fastUrl = cloudflarePlaybackConfigured() ? createCloudflarePlaybackUrl(browserId) : null;
      const shareUrl = cloudflarePlaybackConfigured() ? createCloudflarePlaybackUrl(id) : null;
      return NextResponse.json({
        item: libraryItem,
      demo: false,
      canPlay: true,
      defaultUrl: fastUrl ?? `/api/stream/${encodeURIComponent(browserId)}`,
      shareUrl: shareUrl ?? `/api/stream/${encodeURIComponent(id)}`,
      prepared: Boolean(preparedId),
      sourceType: sourceType ?? undefined,
      audioTracks: audioTracks
        .map((track) => ({
          label: track.label,
          language: track.language,
          url: cloudflarePlaybackConfigured()
            ? createCloudflarePlaybackUrl(track.id)
            : `/api/stream/${encodeURIComponent(track.id)}`,
        }))
        .filter((track) => Boolean(track.url)),
      });
    }
  }

  const item = libraryItem;
  if (!item) return NextResponse.json({ error: "not-found", message: "Media not found" }, { status: 404 });
  if (item.mediaUrl) {
    const resolved = resolvePlaybackUrl(item.mediaUrl);
    return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
  }
  const resolved = resolvePlaybackUrl(item.mediaUrl);
  return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
}
