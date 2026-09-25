"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  Track,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
} from "@vidstack/react";
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
  imdbId?: string;
  tmdbId?: number;
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

type MediaState = "loading" | "buffering" | "playing" | "paused" | "error";

export function VideoPlayer({
  src,
  hlsUrl,
  sourceType,
  shareUrl,
  title,
  logo,
  imdbId,
  tmdbId,
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
  preparedBrowserCopy = false,
  autoplay = false,
}: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressCallbackRef = useRef(onProgress);
  const endedCallbackRef = useRef(onEnded);
  const lastProgressRef = useRef(0);
  const autoplayWantedRef = useRef(autoplay);
  const playbackStartedRef = useRef(false);
  const userPausedRef = useRef(false);
  const autoNextCancelledRef = useRef(false);

  const preferredSource = preparedBrowserCopy && src ? src : hlsUrl || src;
  const [source, setSource] = useState(preferredSource);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [resumeApplied, setResumeApplied] = useState(false);
  const [mediaState, setMediaState] = useState<MediaState>("loading");
  const [showUpNext, setShowUpNext] = useState(false);
  const [outroStart, setOutroStart] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(Boolean(autoplay));
  const [soundLocked, setSoundLocked] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const flatEpisodes = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode ? flatEpisodes.findIndex((candidate) => candidate.id === episode.id) : -1;
  const previousEpisode = onEpisode && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEpisode = onEpisode && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
    ? flatEpisodes[episodeIndex + 1]
    : null;

  useEffect(() => { progressCallbackRef.current = onProgress; }, [onProgress]);
  useEffect(() => { endedCallbackRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    autoplayWantedRef.current = autoplay;
  }, [autoplay]);

  useEffect(() => {
    setSource(preferredSource);
    setFallbackUsed(false);
    setResumeApplied(false);
    setMediaState("loading");
    setShowUpNext(false);
    setDuration(0);
    setCurrentTime(0);
    setOutroStart(null);
    setErrorMessage(null);
    setMuted(Boolean(autoplay));
    setSoundLocked(false);
    playbackStartedRef.current = false;
    userPausedRef.current = false;
    autoNextCancelledRef.current = false;
  }, [preferredSource, autoplay]);

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

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    const player = playerRef.current;
    if (!player || player.paused) return;
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2800);
  }, []);

  const configureProvider = useCallback((provider: MediaProviderAdapter | null) => {
    if (!isHLSProvider(provider)) return;
    provider.library = () => import("hls.js");
    provider.config = {
      enableWorker: true,
      lowLatencyMode: false,
      capLevelToPlayerSize: true,
      backBufferLength: 90,
      maxBufferLength: 30,
    };
  }, []);

  const applyResume = useCallback(() => {
    const player = playerRef.current;
    if (!player || resumeApplied || !initialTime || initialTime <= 0.5) return;
    const currentDuration = player.duration;
    if (!Number.isFinite(currentDuration) || currentDuration <= 0) return;
    const target = Math.min(initialTime, Math.max(0, currentDuration - 0.25));
    try {
      player.currentTime = target;
      setResumeApplied(true);
    } catch {
      // Retry on the next metadata/canplay event.
    }
  }, [initialTime, resumeApplied]);

  const loadOutroTiming = useCallback(async () => {
    const seasonNumber = episode?.season;
    const episodeNumber = episode?.episode;
    if ((!tmdbId && !imdbId) || !seasonNumber || !episodeNumber) return;

    const player = playerRef.current;
    const params = new URLSearchParams({
      season: String(seasonNumber),
      episode: String(episodeNumber),
    });
    if (tmdbId) params.set("tmdbId", String(tmdbId));
    else if (imdbId) params.set("imdbId", imdbId);
    if (player && Number.isFinite(player.duration) && player.duration > 0) {
      params.set("duration", String(player.duration));
    }

    try {
      const response = await fetch(`/api/segments?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { outroStart?: number | null };
      const value = Number(data.outroStart);
      if (Number.isFinite(value) && value > 0 && (!player || !Number.isFinite(player.duration) || value < player.duration)) {
        setOutroStart(value);
      }
    } catch {
      // End-of-file fallback remains active when metadata is unavailable.
    }
  }, [episode?.season, episode?.episode, imdbId, tmdbId]);

  const playNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    autoNextCancelledRef.current = false;
    setShowUpNext(false);
    onEpisode?.(nextEpisode);
  }, [nextEpisode, onEpisode]);

  const playPreviousEpisode = useCallback(() => {
    if (!previousEpisode) return;
    onEpisode?.(previousEpisode);
  }, [previousEpisode, onEpisode]);

  const attemptAutoplay = useCallback(async () => {
    if (!autoplayWantedRef.current) return false;
    const player = playerRef.current;
    if (!player) return false;

    const currentDuration = Number(player.duration);
    if (!Number.isFinite(currentDuration) || currentDuration <= 0) return false;

    try {
      // Bootstrap muted so browser autoplay policy cannot block playback.
      player.muted = true;
      setMuted(true);
      await player.play();
      userPausedRef.current = false;
      setMediaState("playing");
      setErrorMessage(null);
      showControls();

      // Restore audio only after playback is confirmed.
      window.setTimeout(() => {
        const current = playerRef.current;
        if (!current || current.paused) return;
        try {
          current.muted = false;
        } catch {
          // Keep muted playback if the browser enforces the policy.
        }
        setMuted(Boolean(current.muted));
        setSoundLocked(Boolean(current.muted));
      }, 0);
      return true;
    } catch {
      // A transient play rejection is not treated as a fatal playback error.
      return false;
    }
  }, [showControls]);

  useEffect(() => {
    if (!autoplay) return;
    const retryDelays = [0, 100, 300, 700, 1400, 2500];
    const timers = retryDelays.map((delay) => window.setTimeout(() => {
      void attemptAutoplay();
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [attemptAutoplay, autoplay, source]);

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;

    try {
      if (player.paused) {
        userPausedRef.current = false;
        await player.play();
        setMediaState("playing");
        setErrorMessage(null);
      } else {
        userPausedRef.current = true;
        player.pause();
        setMediaState("paused");
      }
    } catch {
      setErrorMessage("Playback could not be started.");
      setMediaState("error");
    }
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.muted = !player.muted;
    setMuted(Boolean(player.muted));
    setSoundLocked(false);
    showControls();
  }, [showControls]);

  const changeRate = useCallback((nextRate: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.playbackRate = nextRate;
    setRate(nextRate);
    showControls();
  }, [showControls]);

  const handleSeek = useCallback((value: string) => {
    const player = playerRef.current;
    const nextTime = Number(value);
    if (!player || !Number.isFinite(nextTime)) return;
    try {
      player.currentTime = Math.max(0, Math.min(nextTime, Number.isFinite(player.duration) ? player.duration : nextTime));
      setCurrentTime(player.currentTime);
    } catch {
      // Ignore seek failures before the stream exposes a seekable range.
    }
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const host = document.querySelector(".player-overlay") as HTMLElement | null;
    if (!host) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.requestFullscreen?.();
    } catch {
      // Fullscreen is optional on browsers that do not expose the API.
    }
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
      // User cancelled sharing.
    }
  }, [shareUrl, src, title]);

  const cancelAutoNext = useCallback(() => {
    autoNextCancelledRef.current = true;
    setShowUpNext(false);
  }, []);

  const handleRootClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input")) return;
    void togglePlay();
  }, [togglePlay]);

  const handleTimeUpdate = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const nextDuration = Number(player.duration);
    const nextTime = Number(player.currentTime);
    setCurrentTime(Number.isFinite(nextTime) ? nextTime : 0);
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
    emitProgress(false);

    if (!nextEpisode || autoNextCancelledRef.current || !Number.isFinite(nextDuration) || nextDuration <= 0 || !Number.isFinite(nextTime)) return;

    const trigger = outroStart !== null
      ? outroStart
      : Math.max(0, nextDuration - UP_NEXT_DISPLAY_SECONDS);

    if (!player.paused && nextTime >= trigger) setShowUpNext(true);
  }, [emitProgress, nextEpisode, outroStart]);

  const formatTime = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className={`premium-player-v2${controlsVisible ? " controls-visible" : ""}`}
      onPointerMove={showControls}
      onMouseLeave={() => {
        const player = playerRef.current;
        if (player && !player.paused) setControlsVisible(false);
      }}
      onClick={handleRootClick}
    >
      <MediaPlayer
        ref={playerRef}
        className="premium-player-v2__media"
        title={episodeTitle ? `${title} — ${episodeTitle}` : title}
        src={{
          src: source,
          type: hlsUrl && !fallbackUsed && source === hlsUrl
            ? "application/x-mpegurl"
            : sourceType === "video/webm"
              ? "video/webm"
              : sourceType === "video/ogg"
                ? "video/ogg"
                : "video/mp4",
        }}
        load="eager"
        playsInline
        autoplay
        muted={autoplay}
        onProviderChange={configureProvider}
        onLoadedMetadata={() => {
          applyResume();
          setDuration(Number.isFinite(playerRef.current?.duration) ? Number(playerRef.current?.duration) : 0);
          void loadOutroTiming();
          void attemptAutoplay();
        }}
        onCanPlay={() => {
          void attemptAutoplay();
        }}
        onPlaying={() => {
          playbackStartedRef.current = true;
          userPausedRef.current = false;
          setMediaState("playing");
          setErrorMessage(null);
          setMuted(Boolean(playerRef.current?.muted));
          setSoundLocked(Boolean(playerRef.current?.muted));
          setControlsVisible(true);
        }}
        onPlay={() => {
          playbackStartedRef.current = true;
          userPausedRef.current = false;
          setMediaState("playing");
          setErrorMessage(null);
        }}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setMediaState("buffering")}
        onStalled={() => setMediaState("buffering")}
        onPause={() => {
          emitProgress(true);
          if (autoplayWantedRef.current && !playbackStartedRef.current && !userPausedRef.current) {
            setMediaState("loading");
            window.setTimeout(() => void attemptAutoplay(), 120);
            return;
          }
          setMediaState("paused");
          setControlsVisible(true);
        }}
        onEnded={() => {
          emitProgress(true);
          setShowUpNext(false);
          if (nextEpisode && !autoNextCancelledRef.current) playNextEpisode();
          endedCallbackRef.current?.();
        }}
        onError={() => {
          playbackStartedRef.current = false;
          if (!fallbackUsed && hlsUrl && src && source === hlsUrl) {
            setFallbackUsed(true);
            setSource(src);
            setResumeApplied(false);
            setMediaState("loading");
            return;
          }
          setMediaState("error");
          setErrorMessage("Unable to load this video.");
        }}
      >
        <MediaProvider>
          {subtitleUrl ? <Track src={subtitleUrl} kind="subtitles" language="en" label="English" default={false} /> : null}
        </MediaProvider>
      </MediaPlayer>

      <div className="premium-player-v2__vignette" aria-hidden="true" />

      {(mediaState === "loading" || mediaState === "buffering") ? (
        <div className="premium-player-state" aria-live="polite">
          {logo ? <img className="premium-player-state__logo" src={logo} alt="" /> : <strong className="premium-player-state__title">{title}</strong>}
          <span className="premium-player-state__status">{mediaState === "buffering" ? "Buffering" : "Starting playback"}</span>
        </div>
      ) : null}

      {mediaState === "error" ? (
        <div className="premium-player-state premium-player-state--error" aria-live="assertive">
          {logo ? <img className="premium-player-state__logo" src={logo} alt="" /> : <strong className="premium-player-state__title">{title}</strong>}
          <span className="premium-player-state__status">{errorMessage ?? "Unable to load this video."}</span>
          <button type="button" className="premium-player-state__play" onClick={() => void attemptAutoplay()}>
            Retry
          </button>
        </div>
      ) : null}

      {soundLocked && mediaState === "playing" ? (
        <button type="button" className="premium-player-v2__sound-hint" onClick={toggleMute} aria-label="Enable sound">
          Sound
        </button>
      ) : null}

      {mediaState === "paused" ? (
        <button type="button" className="premium-player-v2__center-play" onClick={() => void togglePlay()} aria-label="Play">
          <span aria-hidden="true">▶</span>
        </button>
      ) : null}

      {showUpNext && nextEpisode ? (
        <div className="auto-next-card" role="status" aria-live="polite">
          <div className="auto-next-copy">
            <span className="auto-next-eyebrow">UP NEXT</span>
            <strong>{nextEpisode.title}</strong>
            <span className="auto-next-meta">
              S{String(nextEpisode.season).padStart(2, "0")} · E{String(nextEpisode.episode).padStart(2, "0")}
            </span>
            <span className="auto-next-hint">Starts automatically when this episode ends</span>
          </div>
          <div className="auto-next-actions">
            <button type="button" className="auto-next-play" onClick={playNextEpisode}>Play now</button>
            <button type="button" className="auto-next-cancel" onClick={cancelAutoNext}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div className="premium-player-v2__topbar">
        <button type="button" className="premium-player-v2__icon" onClick={onClose} aria-label="Close player" title="Close"><IClose /></button>
        <div className="premium-player-v2__title-wrap">
          <span className="premium-player-v2__eyebrow">NOW PLAYING</span>
          <strong>{episodeTitle ? `${title} — ${episodeTitle}` : title}</strong>
        </div>
        <div className="premium-player-v2__actions">
          {previousEpisode ? <button type="button" className="premium-player-v2__icon" onClick={playPreviousEpisode} aria-label="Previous episode" title="Previous episode"><IArrowLeft /></button> : null}
          {nextEpisode ? <button type="button" className="premium-player-v2__icon" onClick={playNextEpisode} aria-label="Next episode" title="Next episode"><IArrowRight /></button> : null}
          {shareUrl || src ? <button type="button" className="premium-player-v2__icon" onClick={() => void handleShare()} aria-label="Share stream" title="Share"><ILink /></button> : null}
        </div>
      </div>

      <div className="premium-player-v2__controls">
        <div className="premium-player-v2__progress-row">
          <input
            aria-label="Seek"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => handleSeek(event.target.value)}
            style={{ "--progress": `${progressPercent}%` } as CSSProperties}
          />
        </div>
        <div className="premium-player-v2__control-row">
          <div className="premium-player-v2__left-controls">
            <button type="button" className="premium-player-v2__control" onClick={() => void togglePlay()} aria-label={mediaState === "playing" ? "Pause" : "Play"}>
              {mediaState === "playing" ? "❚❚" : "▶"}
            </button>
            <span className="premium-player-v2__time">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="premium-player-v2__right-controls">
            <button type="button" className="premium-player-v2__control premium-player-v2__rate" onClick={() => changeRate(rate === 2 ? 1 : Math.min(2, rate + 0.25))} aria-label={`Playback speed ${rate}x`}>
              {rate}×
            </button>
            <button type="button" className="premium-player-v2__control" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button type="button" className="premium-player-v2__control" onClick={() => void toggleFullscreen()} aria-label="Fullscreen">
              ⛶
            </button>
          </div>
        </div>
      </div>

      {demo ? <div className="premium-player-v2__badge" aria-label="Demo preview stream">DEMO PREVIEW</div> : null}
      {fallbackUsed ? <div className="premium-player-v2__notice" role="status">Switched to the browser-compatible backup stream.</div> : null}
    </div>
  );
}
