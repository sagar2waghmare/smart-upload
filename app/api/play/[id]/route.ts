import { NextResponse } from "next/server";
import { getPlaybackLibrarySource } from "../../../../lib/library-service";
import {
  findPreparedAudioTracks,
  findPreparedBrowserMedia,
  findPreparedHlsManifest,
  getDrivePlaybackMetadata,
} from "../../../../lib/google-drive-playback";
import { requireSession, unauthorized } from "../../../../lib/auth";
import { cloudflarePlaybackConfigured, createCloudflarePlaybackUrl } from "../../../../lib/cloudflare-playback";

type Params = { params: Promise<{ id: string }> };

function browserNativeVideo(type: string | null, name = ""): boolean {
  const normalized = type?.toLowerCase().split(";")[0].trim() ?? "";
  // Keep direct byte-for-byte gateway playback limited to the broadly
  // interoperable browser containers. Matroska/QuickTime may be decodable
  // in some Chromium environments, but container support alone does not
  // guarantee the contained video/audio codecs are browser-playable.
  if (normalized === "video/mp4" || normalized === "video/webm" || normalized === "video/ogg") {
    return true;
  }

  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return [".mp4", ".m4v", ".webm", ".ogg", ".ogv"].includes(ext);
}

function browserPlaybackType(type: string | null, name = ""): string | null {
  const normalized = type?.toLowerCase().split(";")[0].trim() ?? "";
  if (browserNativeVideo(normalized, name)) {
    if (normalized) return normalized;
    const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    if (ext === ".mkv") return "video/x-matroska";
    if (ext === ".mov") return "video/quicktime";
    if (ext === ".webm") return "video/webm";
    if (ext === ".ogg" || ext === ".ogv") return "video/ogg";
    return "video/mp4";
  }
  return null;
}


export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const { id } = await params;

  // The catalog/D1 index is the playback authorization boundary. Do not
  // re-run the presentation-layer grouping logic as the source of truth.
  const sourceRecord = await getPlaybackLibrarySource(id);
  if (!sourceRecord) {
    return NextResponse.json(
      {
        error: "media-not-in-library",
        message: "Media not found in the indexed library.",
      },
      { status: 404 },
    );
  }

  const libraryItem = sourceRecord.item;
  let playbackId = id;
  if (libraryItem.seasons?.length) {
    const firstEpisode = libraryItem.seasons
      .flatMap((season) => season.episodes)
      .find((ep) => ep.id);
    if (firstEpisode?.id && firstEpisode.id !== id) playbackId = firstEpisode.id;
  }

  // For a series, the catalog id can point at the grouped series while the
  // actual media source is the selected episode. Resolve MIME from the exact
  // playback file's indexed row before falling back to a Drive metadata read.
  let playbackSource = sourceRecord;
  if (playbackId !== id) {
    const episodeSource = await getPlaybackLibrarySource(playbackId);
    if (episodeSource) playbackSource = episodeSource;
  }

  const useCloudflareStream = cloudflarePlaybackConfigured();
  let sourceType = playbackSource.mimeType ?? null;

  if (!sourceType) {
    try {
      const driveMedia = await getDrivePlaybackMetadata(playbackId);
      sourceType = driveMedia?.mimeType ?? null;
    } catch (err) {
      console.error(
        "[play] Drive metadata lookup failed",
        err instanceof Error ? err.message : "unknown error",
      );
      return NextResponse.json(
        {
          error: "drive-metadata-unavailable",
          message: "Google Drive could not verify the playback source.",
        },
        { status: 502 },
      );
    }
  }

  const browserType = browserPlaybackType(sourceType, playbackSource.name);
  const nativeVideo = Boolean(browserType);

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
        sourceType: browserType,
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
    const preparedUrl = "/api/stream/" + encodeURIComponent(playbackId) + "?variant=browser";
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
        sourceType: browserType ?? sourceType,
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
