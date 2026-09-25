"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import type { Episode, MediaItem } from "../lib/types";
import { IArrowLeft, IArrowRight, IClose, ILink } from "./icons";

type Props = {
  src: string;
  hlsUrl?: string;
  sourceType?: string;
  shareUrl?: string;
  poster?: string | null;
  backdrop?: string | null;
  title: string;
  logo?: string | null;
  episodeTitle?: string;
  demo?: boolean;
  subtitleUrl?: string;
  item: MediaItem;
  episode?: Episode | null;
  onEpisode?: (ep: Episode) => void;
  initialTime?: number;
  onProgress?: (p: { position: number; duration: number }) => void;
  onEnded?: () => void;
  onClose?: () => void;
  audioTracks?: Array<{ label: string; language?: string; url: string }>;
  preparedBrowserCopy?: boolean;
  autoplay?: boolean;
};

const UP_NEXT_DISPLAY_SECONDS = 12;
const AUTO_NEXT_TRIGGER_SECONDS = 0.75;

export function VideoPlayer({
  src,
  hlsUrl,
  sourceType,
  shareUrl,
  poster,
  backdrop,
  title,
  logo,
  episodeTitle,
  demo,
  subtitleUrl,
  item,
  episode,
  onEpisode,
  initialTime,
  onProgress,
  onEnded,
  onClose,
  audioTracks,
  preparedBrowserCopy = false,
  autoplay = false,
}: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const preferredSource = preparedBrowserCopy && src ? src : hlsUrl || src;
  const [source, setSource] = useState(preferredSource);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [resumeApplied, setResumeApplied] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [mediaState, setMediaState] = useState<"loading" | "buffering" | "playing" | "paused">("loading");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const lastProgressRef = useRef(0);
  const progressCallbackRef = useRef(onProgress);
  const endedCallbackRef = useRef(onEnded);
  const autoNextCancelledRef = useRef(false);
  const autoNextTriggeredRef = useRef(false);

  useEffect(() => { progressCallbackRef.current = onProgress; }, [onProgress]);
  useEffect(() => { endedCallbackRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    setSource(preferredSource);
    setFallbackUsed(false);
    setResumeApplied(false);
    setShowUpNext(false);
    setAutoplayBlocked(false);
    setMediaState("loading");
    autoNextCancelledRef.current = false;
    autoNextTriggeredRef.current = false;
  }, [preferredSource]);

  const emitProgress = useCallback((force = false) => {
    const player = playerRef.current;
    if (!player) return;
    const now = Date.now();
    if (!force && now - lastProgressRef.current < 4000) return;
    lastProgressRef.current = now;
    progressCallbackRef.current?.({
      position: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
    });
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const url = shareUrl || src;
      if (navigator.share) await navigator.share({ title, text: "Smart Upload stream", url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
    } catch {
      // User cancelled the native share dialog.
    }
  }, [shareUrl, src, title]);

  const configureProvider = useCallback((provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      provider.library = () => import("hls.js");
      provider.config = { enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: true, backBufferLength: 90, maxBufferLength: 30 };
    }
  }, []);

  const applyResume = useCallback(() => {
    const player = playerRef.current;
    if (!player || resumeApplied || !initialTime || initialTime <= 0.5) return;
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const target = Math.min(initialTime, Math.max(0, duration - 0.25));
    setResumeApplied(true);
    try { player.currentTime = target; } catch { setResumeApplied(false); }
  }, [initialTime, resumeApplied]);

  const handleCanPlay = useCallback(() => {
    applyResume();
    if (autoplay) {
      const player = playerRef.current;
      if (player) {
        void player.play().then(() => {
          setAutoplayBlocked(false);
          setMediaState("playing");
        }).catch(() => {
          setAutoplayBlocked(true);
          setMediaState("paused");
        });
      }
    }
  }, [applyResume, autoplay]);

  const flatEpisodes = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode ? flatEpisodes.findIndex((candidate) => candidate.id === episode.id) : -1;
  const previousEpisode = onEpisode && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEpisode = onEpisode && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1 ? flatEpisodes[episodeIndex + 1] : null;

  const playNextEpisode = useCallback(() => {
    if (!nextEpisode || !onEpisode || autoNextTriggeredRef.current) return;
    autoNextTriggeredRef.current = true;
    setShowUpNext(false);
    onEpisode(nextEpisode);
  }, [nextEpisode, onEpisode]);

  const cancelAutoNext = useCallback(() => {
    autoNextCancelledRef.current = true;
    setShowUpNext(false);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    emitProgress(false);
    if (!nextEpisode || autoNextCancelledRef.current || autoNextTriggeredRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const duration = Number(player.duration);
    const currentTime = Number(player.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return;
    const remaining = duration - currentTime;
    if (remaining <= AUTO_NEXT_TRIGGER_SECONDS) {
      playNextEpisode();
      return;
    }
    setShowUpNext(remaining <= UP_NEXT_DISPLAY_SECONDS);
  }, [emitProgress, nextEpisode, playNextEpisode]);

  return (
    <div className="premium-player-v2">
      <MediaPlayer
        ref={playerRef}
        key={source}
        className="premium-player-v2__media"
        title={episodeTitle ? `${title} — ${episodeTitle}` : title}
        src={{
          src: source,
          type: hlsUrl && !fallbackUsed && source === hlsUrl ? "application/x-mpegurl" : sourceType === "video/webm" ? "video/webm" : sourceType === "video/ogg" ? "video/ogg" : "video/mp4",
        }}
        load="eager"
        crossOrigin="anonymous"
        playsInline
        autoplay={autoplay}
        onProviderChange={configureProvider}
        onCanPlay={handleCanPlay}
        onLoadedMetadata={applyResume}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => { setAutoplayBlocked(false); setMediaState("playing"); }}
        onPlaying={() => { setAutoplayBlocked(false); setMediaState("playing"); }}
        onWaiting={() => setMediaState("buffering")}
        onStalled={() => setMediaState("buffering")}
        onPause={() => { emitProgress(true); setMediaState("paused"); }}
        onEnded={() => {
          emitProgress(true);
          if (nextEpisode && !autoNextCancelledRef.current) playNextEpisode();
          endedCallbackRef.current?.();
        }}
        onError={() => {
          if (!fallbackUsed && hlsUrl && src && source === hlsUrl) {
            setFallbackUsed(true);
            setSource(src);
            setResumeApplied(false);
            return;
          }
          emitProgress(true);
        }}
      >
        <MediaProvider>
          {poster || backdrop ? <Poster className="premium-player-v2__poster" src={poster ?? backdrop ?? undefined} alt="" /> : null}
          {subtitleUrl ? <Track src={subtitleUrl} kind="subtitles" language="en" label="English" default={false} /> : null}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} colorScheme="dark" noModal seekStep={10} playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]} />
      </MediaPlayer>

      {showUpNext && nextEpisode ? (
        <div className="auto-next-card" role="status" aria-live="polite">
          <div className="auto-next-copy">
            <span className="auto-next-eyebrow">UP NEXT</span>
            <strong>{nextEpisode.title}</strong>
            <span className="auto-next-meta">
              S{String(nextEpisode.season).padStart(2, "0")} · E{String(nextEpisode.episode).padStart(2, "0")}
            </span>
            <span className="auto-next-hint">Starts automatically at the end</span>
          </div>
          <div className="auto-next-actions">
            <button type="button" className="auto-next-play" onClick={playNextEpisode}>Play now</button>
            <button type="button" className="auto-next-cancel" onClick={cancelAutoNext}>Cancel</button>
          </div>
        </div>
      ) : null}

      {mediaState === "loading" || mediaState === "buffering" || autoplayBlocked ? (
        <div className="premium-player-state" aria-live="polite">
          {logo ? <img className="premium-player-state__logo" src={logo} alt="" /> : <strong className="premium-player-state__title">{title}</strong>}
          <div className="premium-player-state__loader" aria-hidden="true"><span /></div>
          <span className="premium-player-state__status">
            {autoplayBlocked ? "Tap to play" : mediaState === "buffering" ? "Buffering" : "Loading"}
          </span>
          {autoplayBlocked ? (
            <button type="button" className="premium-player-state__play" onClick={() => {
              const player = playerRef.current;
              if (!player) return;
              void player.play().then(() => {
                setAutoplayBlocked(false);
                setMediaState("playing");
              });
            }}>
              Play
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="premium-player-v2__topbar">
        <button type="button" className="premium-player-v2__icon" onClick={onClose} aria-label="Close player" title="Close"><IClose /></button>
        <div className="premium-player-v2__title-wrap"><span className="premium-player-v2__eyebrow">NOW PLAYING</span><strong>{episodeTitle ? `${title} — ${episodeTitle}` : title}</strong></div>
        <div className="premium-player-v2__actions">
          {previousEpisode ? <button type="button" className="premium-player-v2__icon" onClick={() => onEpisode?.(previousEpisode)} aria-label="Previous episode" title="Previous episode"><IArrowLeft /></button> : null}
          {nextEpisode ? <button type="button" className="premium-player-v2__icon" onClick={playNextEpisode} aria-label="Next episode" title="Next episode"><IArrowRight /></button> : null}
          {shareUrl || src ? <button type="button" className="premium-player-v2__icon" onClick={() => void handleShare()} aria-label="Share stream" title="Share"><ILink /></button> : null}
        </div>
      </div>
      {demo ? <div className="premium-player-v2__badge" aria-label="Demo preview stream">DEMO PREVIEW</div> : null}
      {fallbackUsed ? <div className="premium-player-v2__notice" role="status">Switched to the browser-compatible backup stream.</div> : null}
    </div>
  );
}