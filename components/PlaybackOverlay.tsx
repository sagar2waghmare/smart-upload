"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { useDetails } from "./DetailsProvider";
import { VideoPlayer } from "./VideoPlayer";
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
};

export function PlaybackOverlay() {
  const { item, playerOpen, episode, openPlayer, closePlayer } = useDetails();
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState("");
  const [shareUrl, setShareUrl] = useState<string | undefined>();
  const [sourceType, setSourceType] = useState<string | undefined>();
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);

  const id = item?.id ?? null;

  const epoch = playerOpen ? `${id}:${episode?.id ?? "movie"}` : null;
  const [lastEpoch, setLastEpoch] = useState(epoch);
  if (epoch !== lastEpoch) {
    setLastEpoch(epoch);
    setReady(false);
    setSrc("");
    setShareUrl(undefined);
    setSourceType(undefined);
    setError(null);
  }

  useEffect(() => {
    if (!id || !playerOpen) return;
    let alive = true;
    endedRef.current = false;

    const playbackId = episode?.id ?? id;
    fetch(`/api/play/${encodeURIComponent(playbackId)}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("This title is not in your library.");
        if (!r.ok) throw new Error("Could not load playback information.");
        return (await r.json()) as ApiResult;
      })
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
        setReady(true);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message ?? "Something went wrong.");
      });

    return () => {
      alive = false;
    };
  }, [id, playerOpen, episode, item]);

  const handleProgress = useCallback(
    (p: { position: number; duration: number }) => {
      if (!id) return;
      if (endedRef.current) {
        const nearEnd = p.duration > 0 && p.position >= p.duration * 0.95;
        if (nearEnd) return;
        endedRef.current = false;
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
              key={src}
              src={src}
              sourceType={sourceType}
              shareUrl={shareUrl}
              poster={item.poster}
              backdrop={item.backdrop}
              title={item.title}
              episodeTitle={episode?.title}
              demo={demo}
              item={item}
              episode={episode}
              onEpisode={hasEpisodes ? (ep) => openPlayer(ep) : undefined}
              initialTime={resume || undefined}
              onProgress={handleProgress}
              onEnded={handleEnded}
            />
          </>
        ) : (
          <div className="play-loading" role="status">
            <div className="spinner" />
            <span>Loading stream…</span>
          </div>
        )}
      </div>
    </div>
  );
}