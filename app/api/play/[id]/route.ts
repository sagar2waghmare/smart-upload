import { NextResponse } from "next/server";
import { getMediaById } from "../../../../lib/library-service";
import { resolvePlaybackUrl } from "../../../../lib/playback";
import { findPreparedAudioTracks, findPreparedBrowserMedia, findPreparedHlsManifest, getDriveMediaMimeType, validateDriveMedia } from "../../../../lib/google-drive-playback";
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

  // A series/anime library card is a grouped metadata entry, not a Drive file.
  // Resolve its first available episode so the initial player still gets the
  // same prepared-browser copy and AAC sidecars as a direct episode URL.
  let playbackId = id;
  let driveMedia = await validateDriveMedia(id);
  if (!driveMedia && libraryItem?.seasons?.length) {
    const firstEpisode = libraryItem.seasons
      .flatMap((season) => season.episodes)
      .find((ep) => ep.id);
    if (firstEpisode?.id) {
      playbackId = firstEpisode.id;
      driveMedia = await validateDriveMedia(playbackId);
    }
  }

  if (driveMedia && libraryItem) {
    const preparedId = await findPreparedBrowserMedia(playbackId);
    const hlsManifestId = await findPreparedHlsManifest(playbackId);
    // Sidecar AAC tracks are independent of the browser MP4 copy, so discover
    // them even when playback falls back to the original source.
    const audioTracks = await findPreparedAudioTracks(playbackId);
    const sourceType = preparedId ? "video/mp4" : await getDriveMediaMimeType(playbackId);
    const browserId = preparedId ?? playbackId;
    const fastUrl = cloudflarePlaybackConfigured() ? createCloudflarePlaybackUrl(browserId) : null;
    const shareUrl = cloudflarePlaybackConfigured() ? createCloudflarePlaybackUrl(playbackId) : null;
    return NextResponse.json({
      item: libraryItem,
      demo: false,
      canPlay: true,
      playbackId,
      hlsUrl: hlsManifestId ? `/api/hls/${encodeURIComponent(playbackId)}/master.m3u8` : undefined,
      defaultUrl: fastUrl ?? `/api/stream/${encodeURIComponent(browserId)}`,
      shareUrl: shareUrl ?? `/api/stream/${encodeURIComponent(playbackId)}`,
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

  const item = libraryItem;
  if (!item) return NextResponse.json({ error: "not-found", message: "Media not found" }, { status: 404 });
  if (item.mediaUrl) {
    const resolved = resolvePlaybackUrl(item.mediaUrl);
    return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
  }
  const resolved = resolvePlaybackUrl(item.mediaUrl);
  return NextResponse.json({ item, demo: resolved.demo, canPlay: resolved.canPlay, defaultUrl: resolved.url });
}
