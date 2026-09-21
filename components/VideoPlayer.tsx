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
};

export function VideoPlayer({
  src,
  hlsUrl,
  sourceType,
  shareUrl,
  poster,
  backdrop,
  title,
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
}: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [source, setSource] = useState(hlsUrl || src);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [resumeApplied, setResumeApplied] = useState(false);
  const lastProgressRef = useRef(0);
  const progressCallbackRef = useRef(onProgress);
  const endedCallbackRef = useRef(onEnded);

  useEffect(() => {
    progressCallbackRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    endedCallbackRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const nextSource = hlsUrl || src;
    setSource(nextSource);
    setFallbackUsed(false);
    setResumeApplied(false);
  }, [hlsUrl, src]);

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
      if (navigator.share) {
        await navigator.share({ title, text: "Smart Upload stream", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // User cancelled the native share dialog.
    }
  }, [shareUrl, src, title]);

  const configureProvider = useCallback((provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      provider.library = () => import("hls.js");
      provider.config = {
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        backBufferLength: 90,
        maxBufferLength: 30,
      };
    }
  }, []);

  const applyResume = useCallback(() => {
    const player = playerRef.current;
    if (!player || resumeApplied || !initialTime || initialTime <= 0.5) return;

    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const target = Math.min(initialTime, Math.max(0, duration - 0.25));
    setResumeApplied(true);
    try {
      player.currentTime = target;
    } catch {
      setResumeApplied(false);
    }
  }, [initialTime, resumeApplied]);

  const handleCanPlay = useCallback(() => {
    const player = playerRef.current;

    // Some older prepared HLS masters can expose a video-only stream with no
    // usable audio rendition. In that case, immediately use the browser MP4
    // backup instead of leaving the user with silent playback.
    if (player && hlsUrl && source === hlsUrl && src && player.audioTracks.length === 0) {
      setFallbackUsed(true);
      setSource(src);
      setResumeApplied(false);
      return;
    }

    applyResume();
  }, [applyResume, hlsUrl, source, src]);

  const flatEpisodes = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode
    ? flatEpisodes.findIndex((candidate) => candidate.id === episode.id)
    : -1;
  const previousEpisode =
    onEpisode && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEpisode =
    onEpisode && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
      ? flatEpisodes[episodeIndex + 1]
      : null;

  return (
    <div className="premium-player-v2">
      <MediaPlayer
        ref={playerRef}
        key={source}
        className="premium-player-v2__media"
        title={episodeTitle ? `${title} — ${episodeTitle}` : title}
        src={{ src: source, type: hlsUrl && !fallbackUsed && source === hlsUrl ? "application/x-mpegurl" : sourceType || "video/mp4" }}
        load="eager"
        crossOrigin="anonymous"
        playsInline
        onProviderChange={configureProvider}
        onCanPlay={handleCanPlay}
        onLoadedMetadata={applyResume}
        onTimeUpdate={() => emitProgress(false)}
        onPause={() => emitProgress(true)}
        onEnded={() => {
          emitProgress(true);
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
          {poster || backdrop ? (
            <Poster
              className="premium-player-v2__poster"
              src={poster ?? backdrop ?? undefined}
              alt=""
            />
          ) : null}
          {subtitleUrl ? (
            <Track
              src={subtitleUrl}
              kind="subtitles"
              language="en"
              label="English"
              default={false}
            />
          ) : null}
        </MediaProvider>

        <DefaultVideoLayout
          icons={defaultLayoutIcons}
          colorScheme="dark"
          noModal
          seekStep={10}
          playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]}
        />
      </MediaPlayer>

      <div className="premium-player-v2__topbar">
        <button
          type="button"
          className="premium-player-v2__icon"
          onClick={onClose}
          aria-label="Close player"
          title="Close"
        >
          <IClose />
        </button>

        <div className="premium-player-v2__title-wrap">
          <span className="premium-player-v2__eyebrow">NOW PLAYING</span>
          <strong>{episodeTitle ? `${title} — ${episodeTitle}` : title}</strong>
        </div>

        <div className="premium-player-v2__actions">
          {previousEpisode ? (
            <button
              type="button"
              className="premium-player-v2__icon"
              onClick={() => onEpisode?.(previousEpisode)}
              aria-label="Previous episode"
              title="Previous episode"
            >
              <IArrowLeft />
            </button>
          ) : null}

          {nextEpisode ? (
            <button
              type="button"
              className="premium-player-v2__icon"
              onClick={() => onEpisode?.(nextEpisode)}
              aria-label="Next episode"
              title="Next episode"
            >
              <IArrowRight />
            </button>
          ) : null}

          {shareUrl || src ? (
            <button
              type="button"
              className="premium-player-v2__icon"
              onClick={() => void handleShare()}
              aria-label="Share stream"
              title="Share"
            >
              <ILink />
            </button>
          ) : null}
        </div>
      </div>

      {demo ? (
        <div className="premium-player-v2__badge" aria-label="Demo preview stream">
          DEMO PREVIEW
        </div>
      ) : null}

      {fallbackUsed ? (
        <div className="premium-player-v2__notice" role="status">
          Switched to the browser-compatible backup stream.
        </div>
      ) : null}
    </div>
  );
}
