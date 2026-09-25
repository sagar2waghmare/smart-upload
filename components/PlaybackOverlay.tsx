"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioVariant, MediaItem } from "../lib/types";
import { useDetails } from "./DetailsProvider";
import { VideoPlayer } from "./VideoPlayer";
import { useTmdbMeta } from "../lib/use-tmdb-metadata";
import { IAlert } from "./icons";
import { clearProgress, getProgress, progressPercent, saveProgress } from "../lib/watch-progress";

type ApiResult = {
  item: MediaItem;
  demo: boolean;
  canPlay: boolean;
  defaultUrl: string;
  shareUrl?: string;
  sourceType?: string;
  prepared?: boolean;
  hlsUrl?: string;
  audioTracks?: AudioVariant[];
};

type CachedPlayback = { data: ApiResult; expiresAt: number };

const PLAYBACK_CACHE_TTL = 5 * 60 * 1000;
const playbackCache = new Map<string, CachedPlayback>();
const playbackInflight = new Map<string, Promise<ApiResult>>();

async function loadPlayback(playbackId: string): Promise<ApiResult> {
  const cached = playbackCache.get(playbackId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = playbackInflight.get(playbackId);
  if (existing) return existing;

  const request = fetch(`/api/play/${encodeURIComponent(playbackId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  }).then(async (response) => {
    const body = (await response.json()) as ApiResult & { error?: string; message?: string };
    if (!response.ok) throw new Error(body.message ?? body.error ?? `Playback request failed (${response.status})`);
    if (!body.defaultUrl) throw new Error("Playback source is unavailable.");
    playbackCache.set(playbackId, { data: body, expiresAt: Date.now() + PLAYBACK_CACHE_TTL });
    return body;
  }).finally(() => {
    playbackInflight.delete(playbackId);
  });

  playbackInflight.set(playbackId, request);
  return request;
}

export function PlaybackOverlay() {
  const { item, playerOpen, episode, openPlayer, closePlayer } = useDetails();
  const tmdb = useTmdbMeta(item);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState("");
  const [shareUrl, setShareUrl] = useState<string | undefined>();
  const [sourceType, setSourceType] = useState<string | undefined>();
  const [demo, setDemo] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioVariant[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [hlsUrl, setHlsUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);

  const id = item?.id ?? null;

  const epoch = playerOpen ? `${id}:${episode?.id ?? "movie"}` : null;

  useEffect(() => {
    setReady(false);
    setSrc("");
    setShareUrl(undefined);
    setSourceType(undefined);
    setAudioTracks([]);
    setPrepared(false);
    setHlsUrl(undefined);
    setError(null);
  }, [epoch]);

  useEffect(() => {
    // Prefetch only while the player is closed. When the player is open,
    // the active request below owns source resolution so a failed manifest
    // cannot be requested twice by preload + playback effects.
    if (!id || playerOpen) return;

    const preload = async (playbackId: string | null) => {
      if (!playbackId) return;
      try {
        await loadPlayback(playbackId);
      } catch {
        // A failed prefetch is deliberately not cached; the real playback
        // request will retry when the user opens the player.
      }
    };

    void preload(id);
    const flat = item?.seasons?.flatMap((season) => season.episodes) ?? [];
    void preload(flat[0]?.id ?? null);

    if (episode?.id) {
      const currentIndex = flat.findIndex((candidate) => candidate.id === episode.id);
      void preload(currentIndex >= 0 ? flat[currentIndex + 1]?.id ?? null : null);
    }
  }, [id, playerOpen, episode?.id, item]);

  useEffect(() => {
    if (!id || !playerOpen) return;
    let alive = true;
    endedRef.current = false;

    const playbackId = episode?.id ?? id;
    loadPlayback(playbackId)
      .then((data) => {
        if (!alive) return;
        if (!data.canPlay) {
          setError("This media item has no playback source configured yet.");
          return;
        }
        const url = data.defaultUrl || episode?.mediaUrl || item?.mediaUrl || (data.demo ? data.defaultUrl : "");
        if (!url) {
          setError("No media source is available for this selection.");
          return;
        }
        setSrc(url);
        setShareUrl(data.shareUrl);
        setSourceType(data.sourceType);
        setDemo(data.demo);
        setPrepared(Boolean(data.prepared));
        setHlsUrl(data.hlsUrl);
        setAudioTracks(data.audioTracks ?? []);
        setReady(true);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message ?? "Something went wrong.");
      });

    return () => {
      alive = false;
    };
  }, [id, playerOpen, episode?.id, item]);

  const handleProgress = useCallback(
    (p: { position: number; duration: number }) => {
      if (!id) return;
      if (endedRef.current) {
        const nearEnd = p.duration > 0 && p.position >= p.duration * 0.95;
        if (nearEnd) return;
        // Reset ended state only when user seeks to a non-terminal position
        // or when starting fresh after replay
        if (p.position < p.duration * 0.95) {
          endedRef.current = false;
        }
      }
      saveProgress({ id, position: p.position, duration: p.duration, episodeId: episode?.id });
    },
    [id, episode],
  );

  const handleEnded = useCallback(() => {
    endedRef.current = true;
    if (id) clearProgress(id);
  }, [id]);

  if (!playerOpen || !item) return null;

  const stored = getProgress(item.id);
  const resume =
    stored && stored.episodeId === episode?.id && progressPercent(stored) >= 5 && progressPercent(stored) < 95
      ? stored.position
      : 0;
  const hasEpisodes = item.kind !== "movie" && Boolean(episode);
  const title = episode ? `${item.title} — ${episode.title}` : item.title;

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Player — ${title}`}>
      <div className="play-stage">
        {error ? (
          <div className="state-box" role="alert">
            <IAlert />
            <h3>Playback unavailable</h3>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={closePlayer}>Back to details</button>
          </div>
        ) : ready && src ? (
          <>
            <VideoPlayer
              src={src}
              hlsUrl={hlsUrl}
              sourceType={sourceType}
              shareUrl={shareUrl}
              poster={item.poster}
              backdrop={item.backdrop}
              title={item.title}
              logo={tmdb.meta?.logo}
              imdbId={tmdb.meta?.imdbId}
              tmdbId={item.tmdbId}
              episodeTitle={episode?.title}
              demo={demo}
              item={item}
              episode={episode}
              onEpisode={hasEpisodes ? (ep) => openPlayer(ep) : undefined}
              initialTime={resume || undefined}
              onProgress={handleProgress}
              onEnded={handleEnded}
              onClose={closePlayer}
              audioTracks={audioTracks}
              preparedBrowserCopy={Boolean(prepared)}
              autoplay
            />
          </>
        ) : (
          <div
            className="premium-stream-splash"
            role="status"
            aria-live="polite"
            style={{
              backgroundImage: (tmdb.meta?.backdrop ?? item.backdrop)
                ? `linear-gradient(180deg, rgba(0,0,0,.2), rgba(0,0,0,.78)), url("${tmdb.meta?.backdrop ?? item.backdrop}")`
                : undefined,
            }}
          >
            {tmdb.meta?.logo ? (
              <img className="premium-stream-splash__logo" src={tmdb.meta.logo} alt="" />
            ) : (
              <strong className="premium-stream-splash__title">{item.title}</strong>
            )}
            <span className="premium-stream-splash__status">Starting playback</span>
          </div>
        )}
      </div>
    </div>
  );
}