import { NextResponse } from "next/server";
import { getMediaById } from "../../../../lib/library-service";
import { resolvePlaybackUrl } from "../../../../lib/playback";
import {
  findPreparedAudioTracks,
  findPreparedBrowserMedia,
  findPreparedHlsManifest,
  getDriveMediaMimeType,
  validateDriveMedia,
} from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";
import { cloudflarePlaybackConfigured, createCloudflarePlaybackUrl } from "../../../../lib/cloudflare-playback";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;

  const libraryItem = await getMediaById(id);

  let playbackId = id;
  if (libraryItem?.seasons?.length) {
    const firstEpisode = libraryItem.seasons
      .flatMap((season) => season.episodes)
      .find((ep) => ep.id);

    if (firstEpisode?.id && firstEpisode.id !== id) {
      playbackId = firstEpisode.id;
    }
  }

  if (libraryItem) {
    const useCloudflareStream = cloudflarePlaybackConfigured();
    let driveMedia = false;
    try {
      driveMedia = await validateDriveMedia(playbackId);
    } catch (err) {
      console.warn(
        "[play] Drive validation unavailable; using indexed playback fallback",
        err instanceof Error ? err.message : "unknown error",
      );
    }

    let preparedId: string | null = null;
    let hlsManifestId: string | null = null;
    let audioTracks: Array<{ label: string; language?: string; id: string }> = [];
    let sourceType: string | null = null;

    if (driveMedia && !useCloudflareStream) {
      try {
        [preparedId, hlsManifestId, audioTracks] = await Promise.all([
          findPreparedBrowserMedia(playbackId),
          findPreparedHlsManifest(playbackId),
          findPreparedAudioTracks(playbackId),
        ]);
        sourceType = preparedId ? "video/mp4" : await getDriveMediaMimeType(playbackId);
      } catch (err) {
        console.warn(
          "[play] Prepared media discovery unavailable; using source fallback",
          err instanceof Error ? err.message : "unknown error",
        );
        preparedId = null;
        hlsManifestId = null;
        audioTracks = [];
        sourceType = null;
      }
    }

    // The streaming Worker has its own Google service-account boundary.
    // Prepared browser derivatives can exist in Drive yet be inaccessible to
    // that Worker. Prefer the original library file for cross-worker playback;
    // HLS remains available when a prepared manifest exists.
    const browserId = useCloudflareStream ? playbackId : (preparedId ?? playbackId);
    const playbackSourceType = useCloudflareStream
      ? await getDriveMediaMimeType(playbackId).catch(() => null)
      : sourceType;

    const fastUrl = useCloudflareStream
      ? createCloudflarePlaybackUrl(browserId)
      : null;
    const shareUrl = useCloudflareStream
      ? createCloudflarePlaybackUrl(playbackId)
      : null;

    return NextResponse.json({
      item: libraryItem,
      demo: false,
      canPlay: true,
      playbackId,
      hlsUrl: !useCloudflareStream && hlsManifestId
        ? `/api/hls/${encodeURIComponent(playbackId)}/master.m3u8`
        : undefined,
      defaultUrl: fastUrl ?? `/api/stream/${encodeURIComponent(browserId)}`,
      shareUrl: shareUrl ?? `/api/stream/${encodeURIComponent(playbackId)}`,
      prepared: useCloudflareStream ? false : Boolean(preparedId),
      sourceType: playbackSourceType ?? undefined,
      audioTracks: useCloudflareStream
        ? []
        : audioTracks
            .map((track) => ({
              label: track.label,
              language: track.language,
              url: `/api/stream/${encodeURIComponent(track.id)}`,
            }))
            .filter((track) => Boolean(track.url)),
    });
  }

  if (!libraryItem) {
    return NextResponse.json(
      { error: "not-found", message: "Media not found" },
      { status: 404 },
    );
  }

  const resolved = resolvePlaybackUrl(libraryItem.mediaUrl);
  return NextResponse.json({
    item: libraryItem,
    demo: resolved.demo,
    canPlay: resolved.canPlay,
    defaultUrl: resolved.url,
  });
}