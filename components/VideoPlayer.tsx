"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

export function VideoPlayer({
  src,
  hlsUrl,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressCallbackRef = useRef(onProgress);
  const endedCallbackRef = useRef(onEnded);
  const lastProgressRef = useRef(0);

  const preferredSource = preparedBrowserCopy && src ? src : hlsUrl || src;
  const [mediaState, setMediaState] = useState<"loading" | "buffering" | "playing" | "paused" | "error">("loading");
  const [soundLocked, setSoundLocked] = useState(false);
  const autoplayWantedRef = useRef(autoplay);
  const [showUpNext, setShowUpNext] = useState(false);
  const [outroStart, setOutroStart] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => { progressCallbackRef.current = onProgress; }, [onProgress]);
  useEffect(() => { endedCallbackRef.current = onEnded; }, [onEnded]);

  const emitProgress = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    if (!force && now - lastProgressRef.current < 4000) return;
    lastProgressRef.current = now;
    progressCallbackRef.current?.({
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  }, []);

  const flatEpisodes = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode ? flatEpisodes.findIndex((candidate) => candidate.id === episode.id) : -1;
  const previousEpisode = onEpisode && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEpisode = onEpisode && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
    ? flatEpisodes[episodeIndex + 1]
    : null;

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    const video = videoRef.current;
    if (!video || video.paused) return;
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2600);
  }, []);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      try {
        await video.play();
        setMediaState("playing");
      } catch {
        // Keep the startup surface clean. The media event handlers will retry
        // once metadata/buffering is available.
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          setMediaState("paused");
        }
      }
    } else {
      video.pause();
    }
    showControls();
  }, [showControls]);

  const startAutoplay = useCallback(async () => {
    if (!autoplayWantedRef.current) return;
    const video = videoRef.current;
    if (!video || (!video.currentSrc && !preferredSource)) return;

    // Do not treat "not loaded yet" as an autoplay failure. Calling play()
    // before metadata/source readiness is what caused the stale Tap to Play
    // state seen on the live player.
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;

    try {
      video.muted = true;
      setMuted(true);
      await video.play();

      // Once the native element is genuinely playing, restore audio. If the
      // browser keeps it muted, playback still continues and only the small
      // sound affordance remains available.
      window.setTimeout(() => {
        const current = videoRef.current;
        if (!current || current.paused) return;
        try { current.muted = false; } catch { /* browser may keep autoplay muted */ }
        setMuted(current.muted);
        setSoundLocked(current.muted);
      }, 0);

      setMediaState("playing");
      showControls();
    } catch {
      // Do not surface a blocking "Tap to play" overlay here. Retry from
      // loadedmetadata/canplay/playing and the short startup retry window.
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        setMediaState(video.paused ? "paused" : "buffering");
      }
    }
  }, [preferredSource, showControls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;

    const attach = async () => {
      video.removeAttribute("src");
      video.load();

      if (hlsUrl) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
        } else {
          try {
            const module = await import("hls.js");
            if (cancelled) return;
            const HlsCtor = module.default;
            if (HlsCtor.isSupported()) {
              const hls = new HlsCtor({
                enableWorker: true,
                lowLatencyMode: false,
                capLevelToPlayerSize: true,
                backBufferLength: 90,
                maxBufferLength: 30,
              });
              hls.loadSource(hlsUrl);
              hls.attachMedia(video);
              hlsInstance = hls;
            } else {
              video.src = preferredSource;
            }
          } catch {
            video.src = preferredSource;
          }
        }
      } else {
        video.src = preferredSource;
      }

      video.load();

      const retryDelays = [80, 220, 500, 1000, 1800, 3000, 5000];
      retryDelays.forEach((delay) => {
        window.setTimeout(() => {
          if (!cancelled) void startAutoplay();
        }, delay);
      });
    };

    void attach();

    return () => {
      cancelled = true;
      if (hlsInstance) hlsInstance.destroy();
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [hlsUrl, preferredSource, startAutoplay]);

  const loadOutroTiming = useCallback(async () => {
    const seasonNumber = episode?.season;
    const episodeNumber = episode?.episode;
    if ((!tmdbId && !imdbId) || !seasonNumber || !episodeNumber) return;

    const video = videoRef.current;
    const params = new URLSearchParams({
      season: String(seasonNumber),
      episode: String(episodeNumber),
    });
    if (tmdbId) params.set("tmdbId", String(tmdbId));
    else if (imdbId) params.set("imdbId", imdbId);
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      params.set("duration", String(video.duration));
    }

    try {
      const response = await fetch(`/api/segments?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { outroStart?: number | null };
      const value = Number(data.outroStart);
      if (Number.isFinite(value) && value > 0 && (!video?.duration || value < video.duration)) {
        setOutroStart(value);
      }
    } catch {
      // File-end fallback remains active when credit metadata is unavailable.
    }
  }, [episode, imdbId, tmdbId]);

  useEffect(() => {
    if (tmdbId || imdbId) void loadOutroTiming();
  }, [tmdbId, imdbId, episode?.id, loadOutroTiming]);

  const playNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    setShowUpNext(false);
    onEpisode?.(nextEpisode);
  }, [nextEpisode, onEpisode]);

  const playPreviousEpisode = useCallback(() => {
    if (!previousEpisode) return;
    onEpisode?.(previousEpisode);
  }, [previousEpisode, onEpisode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(nextDuration);
      if (initialTime && initialTime > 0.5 && nextDuration > 0) {
        try {
          video.currentTime = Math.min(initialTime, Math.max(0, nextDuration - 0.25));
        } catch {
          // Ignore resume seek failures on streams that are not seek-ready yet.
        }
      }
      void loadOutroTiming();
      void startAutoplay();
    };

    const onCanPlay = () => {
      void startAutoplay();
      setMediaState(video.paused ? "loading" : "playing");
    };

    const onPlaying = () => {
      setMediaState("playing");
      setCurrentTime(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setMuted(video.muted);
      setSoundLocked(video.muted);
      showControls();
    };

    const onPause = () => {
      emitProgress(true);
      setMediaState(video.ended ? "paused" : "paused");
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setSoundLocked(false);
      setControlsVisible(true);
    };

    const onWaiting = () => setMediaState("buffering");
    const onStalled = () => setMediaState("buffering");

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(nextDuration);
      emitProgress(false);

      if (!nextEpisode) return;
      const trigger = outroStart !== null
        ? outroStart
        : Math.max(0, nextDuration - UP_NEXT_DISPLAY_SECONDS);
      if (!video.paused && video.currentTime >= trigger) setShowUpNext(true);
    };

    const onEndedEvent = () => {
      emitProgress(true);
      setShowUpNext(false);
      if (nextEpisode) playNextEpisode();
      endedCallbackRef.current?.();
    };

    const onError = () => {
      setMediaState("error");
      setControlsVisible(true);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEndedEvent);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEndedEvent);
      video.removeEventListener("error", onError);
    };
  }, [emitProgress, initialTime, loadOutroTiming, nextEpisode, outroStart, playNextEpisode, showControls, startAutoplay]);

  const cancelAutoNext = useCallback(() => setShowUpNext(false), []);

  const handleSeek = useCallback((value: string) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;
    video.currentTime = Math.max(0, Math.min(nextTime, Number.isFinite(video.duration) ? video.duration : nextTime));
    setCurrentTime(video.currentTime);
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    setSoundLocked(false);
    showControls();
  }, [showControls]);

  const changeRate = useCallback((nextRate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = nextRate;
    setRate(nextRate);
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen?.();
    } catch {
      // Fullscreen can be unavailable or blocked on embedded browsers.
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const url = shareUrl || src;
      if (navigator.share) await navigator.share({ title, text: "Smart Upload stream", url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
    } catch {
      // User cancelled sharing.
    }
  }, [shareUrl, src, title]);

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

  const progressValue = duration > 0 ? Math.min(currentTime, duration) : 0;
  const progressPercent = duration > 0 ? (progressValue / duration) * 100 : 0;
  const displayStatus = soundLocked
    ? "Tap for sound"
    : mediaState === "buffering"
      ? "Buffering"
      : mediaState === "error"
        ? "Unable to start playback"
        : "Starting playback";

  return (
    <div
      ref={rootRef}
      className={`premium-player-v2${controlsVisible ? " controls-visible" : ""}`}
      onPointerMove={showControls}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (video && !video.paused) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className="premium-player-v2__video"
        playsInline
        preload="auto"
        onClick={() => void togglePlay()}
        aria-label={episodeTitle ? `${title} — ${episodeTitle}` : title}
      >
        {subtitleUrl ? <track src={subtitleUrl} kind="subtitles" srcLang="en" label="English" /> : null}
      </video>

      <div className="premium-player-v2__vignette" aria-hidden="true" />

      {(mediaState === "loading" || mediaState === "buffering") ? (
        <div className="premium-player-state" aria-live="polite">
          {logo ? (
            <img className="premium-player-state__logo" src={logo} alt="" />
          ) : (
            <strong className="premium-player-state__title">{title}</strong>
          )}
          <span className="premium-player-state__status">{displayStatus}</span>
        </div>
      ) : null}

      {soundLocked && mediaState === "playing" ? (
        <button
          type="button"
          className="premium-player-v2__sound-hint"
          onClick={toggleMute}
          aria-label="Enable sound"
        >
          Sound
        </button>
      ) : null}

      {(mediaState === "paused") ? (
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
        <button type="button" className="premium-player-v2__icon" onClick={onClose} aria-label="Close player" title="Close">
          <IClose />
        </button>
        <div className="premium-player-v2__title-wrap">
          <span className="premium-player-v2__eyebrow">NOW PLAYING</span>
          <strong>{episodeTitle ? `${title} — ${episodeTitle}` : title}</strong>
        </div>
        <div className="premium-player-v2__actions">
          {previousEpisode ? (
            <button type="button" className="premium-player-v2__icon" onClick={playPreviousEpisode} aria-label="Previous episode" title="Previous episode">
              <IArrowLeft />
            </button>
          ) : null}
          {nextEpisode ? (
            <button type="button" className="premium-player-v2__icon" onClick={playNextEpisode} aria-label="Next episode" title="Next episode">
              <IArrowRight />
            </button>
          ) : null}
          {shareUrl || src ? (
            <button type="button" className="premium-player-v2__icon" onClick={() => void handleShare()} aria-label="Share stream" title="Share">
              <ILink />
            </button>
          ) : null}
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
            value={progressValue}
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
    </div>
  );
}
