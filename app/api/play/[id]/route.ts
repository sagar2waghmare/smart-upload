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

    if (driveMedia) {
      try {
        [preparedId, hlsManifestId, audioTracks] = await Promise.all([
          findPreparedBrowserMedia(playbackId),
          findPreparedHlsManifest(playbackId),
          findPreparedAudioTracks(playbackId),
        ]);
        sourceType = preparedId
          ? "video/mp4"
          : await getDriveMediaMimeType(playbackId);
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

    const browserId = preparedId ?? playbackId;
    const fastUrl = cloudflarePlaybackConfigured()
      ? createCloudflarePlaybackUrl(browserId)
      : null;
    const shareUrl = cloudflarePlaybackConfigured()
      ? createCloudflarePlaybackUrl(playbackId)
      : null;

    return NextResponse.json({
      item: libraryItem,
      demo: false,
      canPlay: true,
      playbackId,
      hlsUrl: hlsManifestId
        ? `/api/hls/${encodeURIComponent(playbackId)}/master.m3u8`
        : undefined,
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