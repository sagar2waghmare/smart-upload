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

function browserNativeVideo(type: string | null): boolean {
  if (!type) return false;
  const normalized = type.toLowerCase().split(";")[0].trim();
  return normalized === "video/mp4" || normalized === "video/webm" || normalized === "video/ogg";
}


export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;

  const libraryItem = await getMediaById(id);
  if (!libraryItem) {
    return NextResponse.json(
      { error: "not-found", message: "Media not found" },
      { status: 404 },
    );
  }

  let playbackId = id;
  if (libraryItem.seasons?.length) {
    const firstEpisode = libraryItem.seasons
      .flatMap((season) => season.episodes)
      .find((ep) => ep.id);
    if (firstEpisode?.id && firstEpisode.id !== id) playbackId = firstEpisode.id;
  }

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

  if (!driveMedia) {
    return NextResponse.json(
      { error: "media-unavailable", message: "This media file is not available for playback." },
      { status: 404 },
    );
  }

  const sourceType = await getDriveMediaMimeType(playbackId).catch(() => null);
  const nativeVideo = browserNativeVideo(sourceType);

  // Use the Cloudflare gateway only for containers a browser can natively decode.
  // Non-native sources fall back to a prepared browser-safe MP4 or HLS.
  if (useCloudflareStream && nativeVideo) {
    const signedUrl = createCloudflarePlaybackUrl(playbackId);
    if (signedUrl) {
      return NextResponse.json({
        item: libraryItem,
        demo: false,
        canPlay: true,
        playbackId,
        defaultUrl: signedUrl,
        shareUrl: signedUrl,
        prepared: false,
        sourceType,
        audioTracks: [],
      });
    }
  }

  let preparedId: string | null = null;
  let hlsManifestId: string | null = null;
  let audioTracks: Array<{ label: string; language?: string; id: string }> = [];

  try {
    [preparedId, hlsManifestId, audioTracks] = await Promise.all([
      findPreparedBrowserMedia(playbackId),
      findPreparedHlsManifest(playbackId),
      findPreparedAudioTracks(playbackId),
    ]);
  } catch (err) {
    console.warn(
      "[play] Prepared media discovery unavailable; using direct source fallback",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  if (preparedId) {
    const preparedUrl = "/api/stream/" + encodeURIComponent(preparedId);
    return NextResponse.json({
      item: libraryItem,
      demo: false,
      canPlay: true,
      playbackId,
      defaultUrl: preparedUrl,
      shareUrl: "/api/stream/" + encodeURIComponent(playbackId),
      prepared: true,
      sourceType: "video/mp4",
      audioTracks: audioTracks.map((track) => ({
        label: track.label,
        language: track.language,
        url: "/api/stream/" + encodeURIComponent(track.id),
      })),
    });
  }

  if (hlsManifestId) {
    const hlsUrl = "/api/hls/" + encodeURIComponent(playbackId) + "/master.m3u8";
    return NextResponse.json({
      item: libraryItem,
      demo: false,
      canPlay: true,
      playbackId,
      defaultUrl: hlsUrl,
      hlsUrl,
      shareUrl: "/api/stream/" + encodeURIComponent(playbackId),
      prepared: false,
      sourceType: "application/x-mpegurl",
      audioTracks: [],
    });
  }

  if (nativeVideo) {
    const fallbackUrl = useCloudflareStream
      ? createCloudflarePlaybackUrl(playbackId)
      : "/api/stream/" + encodeURIComponent(playbackId);

    if (fallbackUrl) {
      return NextResponse.json({
        item: libraryItem,
        demo: false,
        canPlay: true,
        playbackId,
        defaultUrl: fallbackUrl,
        shareUrl: "/api/stream/" + encodeURIComponent(playbackId),
        prepared: false,
        sourceType,
        audioTracks: [],
      });
    }
  }

  return NextResponse.json({
    item: libraryItem,
    demo: false,
    canPlay: false,
    playbackId,
    defaultUrl: "",
    shareUrl: "/api/stream/" + encodeURIComponent(playbackId),
    prepared: false,
    sourceType: sourceType ?? undefined,
    error: "browser-unsupported",
    message: "This source needs a prepared browser-compatible copy or HLS stream.",
  }, { status: 422 });
}
