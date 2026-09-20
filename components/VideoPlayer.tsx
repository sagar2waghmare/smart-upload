"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioVariant, Episode, MediaItem } from "../lib/types";
import {
  IAlert,
  ICheck,
  ICompress,
  IExpand,
  IPause,
  IPlay,
  IReplay,
  ISkipBack,
  ISkipFwd,
  ISubtitles,
  IVolumeHigh,
  IVolumeLow,
  IVolumeMute,
} from "./icons";
import { SmartImage } from "./SmartImage";
import { AudioLanguageControl } from "./AudioLanguageControl";

type Menu = "settings" | "subtitles" | "quality" | null;

type Props = {
  src: string;
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
  audioTracks?: AudioVariant[];
};

const fmt = (t: number) => {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? h + ":" + m.toString().padStart(2, "0") + ":" + s.toString().padStart(2, "0")
    : m + ":" + s.toString().padStart(2, "0");
};

export function VideoPlayer({
  src,
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
  audioTracks = [],
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTapRef = useRef<{ time: number; side: "left" | "right" } | null>(null);
  const currentRef = useRef(0);
  const durationRef = useRef(0);
  const lastEmitRef = useRef(0);
  const initialedRef = useRef(false);
  const playedRef = useRef(false);
  const cbRef = useRef({ onProgress, onEnded });

  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "ended" | "error">("idle");
  const [buffering, setBuffering] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [menu, setMenu] = useState<Menu>(null);
  const [controls, setControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ccOn, setCcOn] = useState(false);
  const [activeSource, setActiveSource] = useState(src);
  const [selectedQuality, setSelectedQuality] = useState("Auto");
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
  const [externalAudioActive, setExternalAudioActive] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<"back" | "forward" | null>(null);

  const qualityVariants = [
    ...(item.qualityVariants ?? []),
    ...(episode?.qualityVariants ?? []),
  ].filter(
    (variant, index, list) =>
      list.findIndex((v) => v.label === variant.label && v.url === variant.url) === index
  );

  const hasExternalAudio = audioTracks.length > 0;
  const playing = status === "playing";

  useEffect(() => {
    cbRef.current = { onProgress, onEnded };
  }, [onProgress, onEnded]);

  useEffect(() => {
    setActiveSource(src);
    setSelectedQuality("Auto");
    setSelectedAudioIndex(0);
    setExternalAudioActive(false);
    setShareStatus(null);
    setError(null);
    setStarted(false);
    setStatus("idle");
    initialedRef.current = false;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    video.muted = hasExternalAudio ? externalAudioActive : false;
    if (!audio || !hasExternalAudio) return;

    const track = audioTracks[selectedAudioIndex] ?? audioTracks[0];
    if (!track) return;

    audio.src = track.url;
    audio.load();
    try {
      audio.currentTime = video.currentTime || 0;
    } catch {}

    if (!video.paused && started) {
      void audio.play().catch(() => undefined);
    }
  }, [audioTracks, selectedAudioIndex, hasExternalAudio, started]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) video.muted = hasExternalAudio && externalAudioActive;
    if (audio) {
      audio.volume = muted ? 0 : volume;
      audio.muted = muted;
    }
  }, [hasExternalAudio, externalAudioActive, muted, volume]);

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (video && !video.paused) {
      hideTimer.current = setTimeout(() => setControls(false), 3200);
    }
  }, []);

  const wake = useCallback(() => {
    poke();
    setMenu(null);
  }, [poke]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setError("Playback was blocked. Tap Play again."));
    } else {
      video.pause();
    }
  }, []);

  const syncAudioToVideo = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!hasExternalAudio || !video || !audio) return;
    try {
      audio.currentTime = Math.max(0, video.currentTime || 0);
    } catch {}
  }, [hasExternalAudio]);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const max = Number.isFinite(duration) && duration > 0 ? duration : 1e9;
      const next = Math.max(0, Math.min(max, time));
      try {
        video.currentTime = next;
        currentRef.current = next;
        setCurrent(next);
        if (audioRef.current && hasExternalAudio) audioRef.current.currentTime = next;
      } catch {}
    },
    [duration, hasExternalAudio]
  );

  const emitProgress = useCallback((force = false) => {
    if (!playedRef.current) return;
    const now = Date.now();
    if (!force && now - lastEmitRef.current < 4000) return;

    const pos = currentRef.current;
    lastEmitRef.current = now;
    if (Number.isFinite(pos) && pos >= 0) {
      cbRef.current.onProgress?.({
        position: pos,
        duration: durationRef.current,
      });
    }
  }, []);

  const applyInitial = useCallback(() => {
    const video = videoRef.current;
    if (!video || initialedRef.current || !initialTime || initialTime <= 0.5) return;

    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const target = d > 0 ? Math.min(initialTime, Math.max(0, d - 0.25)) : initialTime;

    initialedRef.current = true;
    setBuffering(true);

    try {
      if (typeof video.fastSeek === "function") video.fastSeek(target);
      else video.currentTime = target;
      currentRef.current = video.currentTime;
      setCurrent(video.currentTime);
      if (audioRef.current && hasExternalAudio) audioRef.current.currentTime = video.currentTime;
    } catch {
      initialedRef.current = false;
      setBuffering(false);
    }
  }, [initialTime, hasExternalAudio]);

  const changeVolume = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      const video = videoRef.current;
      const audio = audioRef.current;

      setVolume(next);
      setMuted(next === 0);

      if (video) {
        video.volume = next;
        video.muted = hasExternalAudio ? externalAudioActive : next === 0;
      }
      if (audio) {
        audio.volume = next;
        audio.muted = next === 0;
      }
    },
    [hasExternalAudio, externalAudioActive]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    const nextMuted = hasExternalAudio ? !(audio?.muted ?? muted) : !video.muted;
    setMuted(nextMuted);

    if (hasExternalAudio) {
      if (audio) audio.muted = nextMuted;
      video.muted = externalAudioActive;
    } else {
      video.muted = nextMuted;
    }
  }, [hasExternalAudio, externalAudioActive, muted]);

  const switchQuality = useCallback(
    (label: string, url: string) => {
      const video = videoRef.current;
      if (!video || url === activeSource) {
        setSelectedQuality(label);
        setMenu(null);
        return;
      }

      const position = video.currentTime;
      const wasPlaying = !video.paused;

      setBuffering(true);
      setError(null);
      setSelectedQuality(label);
      setActiveSource(url);
      setMenu(null);

      window.setTimeout(() => {
        const next = videoRef.current;
        if (!next) return;

        const resume = () => {
          try {
            if (Number.isFinite(position)) next.currentTime = position;
          } catch {}
          if (wasPlaying) void next.play().catch(() => undefined);
        };

        if (next.readyState >= 1) resume();
        else next.addEventListener("loadedmetadata", resume, { once: true });
      }, 0);
    },
    [activeSource]
  );

  const showSeekFeedback = useCallback((direction: "back" | "forward") => {
    setSeekFeedback(direction);
    if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    seekFeedbackTimer.current = setTimeout(() => setSeekFeedback(null), 700);
  }, []);

  const performDoubleTapSeek = useCallback(
    (clientX: number, rect: DOMRect) => {
      const side = clientX - rect.left < rect.width / 2 ? "left" : "right";
      const delta = side === "left" ? -10 : 10;
      seek((videoRef.current?.currentTime ?? current) + delta);
      showSeekFeedback(delta < 0 ? "back" : "forward");
    },
    [current, seek, showSeekFeedback]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!started) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, input, a, .pc-pop, .player-close")) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const side: "left" | "right" =
        touch.clientX - rect.left < rect.width / 2 ? "left" : "right";
      const now = Date.now();
      const previous = touchTapRef.current;
      const doubleTap =
        Boolean(previous) &&
        now - (previous?.time ?? 0) <= 320 &&
        previous?.side === side;

      touchTapRef.current = { time: now, side };

      if (!doubleTap) return;
      event.preventDefault();
      touchTapRef.current = null;
      performDoubleTapSeek(touch.clientX, rect);
    },
    [performDoubleTapSeek, started]
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!started) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, input, a, .pc-pop, .player-close")) return;
      performDoubleTapSeek(event.clientX, event.currentTarget.getBoundingClientRect());
    },
    [performDoubleTapSeek, started]
  );

  const selectAudio = useCallback(
    (index: number) => {
      if (!audioTracks[index]) return;
      const video = videoRef.current;
      const audio = audioRef.current;
      const position = video?.currentTime ?? current;

      setSelectedAudioIndex(index);
      setExternalAudioActive(false);
      if (video) video.muted = false;

      if (audio) {
        audio.src = audioTracks[index].url;
        audio.volume = muted ? 0 : volume;
        audio.muted = muted;
        audio.load();
        try {
          audio.currentTime = position;
        } catch {}
        if (video && !video.paused) {
          void audio.play().catch(() => {
            setExternalAudioActive(false);
            video.muted = false;
          });
        }
      }
    },
    [audioTracks, current, muted, volume]
  );

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setStarted(true);
    setError(null);
    setBuffering(true);

    if (audioRef.current && hasExternalAudio) {
      audioRef.current.currentTime = video.currentTime || 0;
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.muted = muted;
      setExternalAudioActive(false);
      video.muted = false;
      void audioRef.current.play().catch(() => {
        setExternalAudioActive(false);
        video.muted = false;
      });
    } else {
      video.muted = muted;
    }

    void video.play().catch(() => {
      setBuffering(false);
      setStarted(false);
      setError("Playback was blocked. Tap Play again.");
    });
  }, [hasExternalAudio, muted, volume]);

  const toggleFullscreen = useCallback(() => {
    const element = wrapRef.current;
    if (!element) return;

    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen().catch(() => undefined);
  }, []);

  const shareStream = useCallback(async () => {
    setShareStatus(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: "Smart Upload stream",
          url: shareUrl ?? activeSource,
        });
        setShareStatus("Shared");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl ?? activeSource);
        setShareStatus("Stream URL copied");
      }
    } catch {}
  }, [activeSource, shareUrl, title]);

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    return () => {
      audioRef.current?.pause();
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    return () => emitProgress(true);
  }, [emitProgress]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (menu) {
        if (event.key === "Escape") setMenu(null);
        return;
      }

      if (event.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else onClose?.();
        return;
      }

      switch (event.key) {
        case " ":
        case "k":
        case "K":
          event.preventDefault();
          togglePlay();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "ArrowRight":
          event.preventDefault();
          seek((videoRef.current?.currentTime ?? current) + 10);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seek((videoRef.current?.currentTime ?? current) - 10);
          break;
        case "ArrowUp":
          event.preventDefault();
          changeVolume((videoRef.current?.volume ?? volume) + 0.1);
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume((videoRef.current?.volume ?? volume) - 0.1);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    menu,
    current,
    volume,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    seek,
    changeVolume,
    onClose,
  ]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const hideCursor = !controls && playing;
  const showCenter = !buffering && !error && (status === "paused" || status === "ended" || !started);

  const hasEpisodes = item.kind !== "movie" && Boolean(episode && onEpisode);
  const flatEpisodes = item.seasons?.flatMap((s) => s.episodes) ?? [];
  const episodeIndex = episode ? flatEpisodes.findIndex((e) => e.id === episode.id) : -1;
  const prevEp = hasEpisodes && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEp =
    hasEpisodes && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
      ? flatEpisodes[episodeIndex + 1]
      : null;

  return (
    <div
      ref={wrapRef}
      className={"player-wrap " + (hideCursor ? "hidden-cursor" : "")}
      onMouseMove={wake}
      onPointerMove={wake}
      onTouchStart={wake}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      {hasExternalAudio ? (
        <audio
          ref={audioRef}
          preload="auto"
          aria-hidden="true"
          onPlaying={() => {
            setExternalAudioActive(true);
            if (videoRef.current) videoRef.current.muted = true;
          }}
          onError={() => {
            setExternalAudioActive(false);
            if (videoRef.current) videoRef.current.muted = false;
          }}
        />
      ) : null}

      <video
        ref={videoRef}
        className="player-video"
        poster={poster ?? backdrop ?? undefined}
        preload={initialTime && initialTime > 0.5 ? "auto" : "metadata"}
        playsInline
        onLoadStart={() => setBuffering(true)}
        onPlay={() => {
          setStatus("playing");
          setBuffering(false);
          poke();
          if (audioRef.current && hasExternalAudio) {
            void audioRef.current.play().catch(() => {
              setExternalAudioActive(false);
              event.currentTarget.muted = false;
            });
          }
        }}
        onPause={() => {
          setStatus("paused");
          setControls(true);
          emitProgress(true);
          audioRef.current?.pause();
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onSeeking={() => {
          if (hasExternalAudio) syncAudioToVideo();
          if (initialTime && initialTime > 0.5 && !initialedRef.current) setBuffering(true);
        }}
        onCanPlay={() => setBuffering(false)}
        onLoadedData={() => applyInitial()}
        onLoadedMetadata={(event) => {
          durationRef.current = event.currentTarget.duration || durationRef.current;
          setDuration(event.currentTarget.duration || 0);
          applyInitial();
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          currentRef.current = time;
          durationRef.current = event.currentTarget.duration || durationRef.current;
          if (time > 0.5) playedRef.current = true;
          setCurrent(time);

          if (
            hasExternalAudio &&
            audioRef.current &&
            Math.abs(audioRef.current.currentTime - time) > 0.35
          ) {
            try {
              audioRef.current.currentTime = time;
            } catch {}
          }

          emitProgress();
        }}
        onSeeked={() => {
          if (hasExternalAudio) syncAudioToVideo();
          setBuffering(false);
          emitProgress(true);
        }}
        onVolumeChange={(event) => {
          if (hasExternalAudio) return;
          setMuted(event.currentTarget.muted);
          setVolume(event.currentTarget.volume);
        }}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onEnded={() => {
          setStatus("ended");
          setControls(true);
          audioRef.current?.pause();
          cbRef.current.onEnded?.();
        }}
        onError={() => {
          setError(
            "This media could not be decoded. Use a browser-safe H.264/AAC copy for unsupported MKV audio/video codecs."
          );
          setBuffering(false);
        }}
      >
        <source src={activeSource} type={activeSource === src ? sourceType : undefined} />
        {subtitleUrl ? (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="en"
            label="English"
            default={ccOn}
          />
        ) : null}
      </video>

      <div className={"player-poster " + (started ? "hidden" : "")}>
        <SmartImage
          src={poster ?? backdrop}
          alt=""
          className="player-poster-img"
          priority
          sizes="100vw"
        />
        <div
          className="player-poster-shade"
          aria-hidden="true"
        />
      </div>

      {showCenter ? (
        <div className="player-center">
          <button
            type="button"
            className="big-play"
            onClick={status === "ended" ? () => {
              seek(0);
              startPlayback();
            } : started ? togglePlay : startPlayback}
            aria-label={status === "ended" ? "Replay" : "Play"}
          >
            {status === "ended" ? <IReplay /> : <IPlay />}
          </button>
        </div>
      ) : null}

      {demo ? <span className="pill pill-warn player-demo-badge">Demo preview stream</span> : null}

      <div
        className={"player-spinner " + (buffering && started ? "" : "hidden")}
        role="status"
        aria-label="Buffering"
      >
        <div className="player-loading-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <i />
        </div>
        <span className="player-loading-label">Loading</span>
      </div>

      {error ? (
        <div className="player-error" role="alert">
          <IAlert />
          <h3>Playback unavailable</h3>
          <p>{error}</p>
          <div className="player-error-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null);
                setStarted(false);
                setStatus("idle");
              }}
            >
              <IReplay /> Try again
            </button>
          </div>
        </div>
      ) : null}

      <div className={"player-topbar " + (controls ? "" : "hidden")}>
        {onClose ? (
          <button
            type="button"
            className="player-close"
            onClick={onClose}
            aria-label="Exit player"
            title="Exit player"
          >
            ×
          </button>
        ) : null}
        <div className="player-title-block">
          <span className="player-title">{title}</span>
          {episodeTitle ? <span className="player-episode">{episodeTitle}</span> : null}
        </div>
        <span className="player-live-dot" aria-hidden="true" />
      </div>

      <div className={"player-gradient " + (controls ? "" : "hidden")} />

      {seekFeedback ? (
        <div
          className={"seek-feedback seek-feedback-" + seekFeedback}
          aria-live="polite"
        >
          <span className="seek-feedback-icon">
            {seekFeedback === "back" ? <ISkipBack /> : <ISkipFwd />}
          </span>
          <span>10 seconds</span>
        </div>
      ) : null}

      <div className={"player-controls " + (controls ? "" : "hidden")}>
        <input
          className="slider pc-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ "--fill": pct + "%" } as React.CSSProperties}
          aria-label="Seek"
          aria-valuetext={fmt(current)}
        />

        <div className="pc-row">
          <button
            type="button"
            className="pc-btn pc-main-play"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <IPause /> : <IPlay />}
          </button>

          <span className="pc-time">
            {fmt(current)} / {fmt(duration)}
          </span>

          <div className="pc-spacer" />

          {prevEp ? (
            <button
              type="button"
              className="pc-btn wide"
              onClick={() => onEpisode?.(prevEp)}
              aria-label={"Previous episode " + prevEp.episode}
            >
              Ep {prevEp.episode}
            </button>
          ) : null}

          <div className="pc-volume">
            <button
              type="button"
              className="pc-btn"
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              onClick={toggleMute}
              title={muted || volume === 0 ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <IVolumeMute /> : volume < 0.5 ? <IVolumeLow /> : <IVolumeHigh />}
            </button>
            <input
              className="slider volume"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              style={{ "--fill": (muted ? 0 : volume * 100) + "%" } as React.CSSProperties}
              aria-label="Volume"
            />
          </div>

          <AudioLanguageControl
            tracks={audioTracks}
            activeIndex={selectedAudioIndex}
            onSelect={selectAudio}
          />

          <div className="pc-menu-anchor">
            <button
              type="button"
              className={"pc-btn pc-menu-btn pc-label-btn " + (ccOn ? "accent" : "")}
              aria-label="Subtitles"
              aria-expanded={menu === "subtitles"}
              onClick={() => setMenu(menu === "subtitles" ? null : "subtitles")}
              title="Subtitles"
            >
              <ISubtitles />
              <span className="pc-btn-label">CC</span>
            </button>
            {menu === "subtitles" ? (
              <div className="pc-pop pc-pop-subtitles">
                <div className="pc-pop-title">SUBTITLES</div>
                {subtitleUrl ? (
                  <button
                    type="button"
                    className={"pc-option " + (ccOn ? "active" : "")}
                    onClick={() => setCcOn((value) => !value)}
                  >
                    <span>English</span>
                    {ccOn ? <ICheck className="check" /> : null}
                  </button>
                ) : (
                  <div className="pc-empty">No subtitles in this stream</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="pc-menu-anchor">
            <button
              type="button"
              className={
                "pc-btn pc-menu-btn pc-label-btn " +
                (selectedQuality === "Auto" ? "accent" : "")
              }
              aria-label="Quality"
              aria-expanded={menu === "quality"}
              onClick={() => setMenu(menu === "quality" ? null : "quality")}
              title="Video quality"
            >
              <span className="pc-quality-mark">
                {selectedQuality === "Auto" ? "AUTO" : selectedQuality}
              </span>
            </button>
            {menu === "quality" ? (
              <div className="pc-pop pc-pop-quality">
                <div className="pc-pop-title">VIDEO QUALITY</div>
                <button
                  type="button"
                  className={"pc-option " + (selectedQuality === "Auto" ? "active" : "")}
                  onClick={() => switchQuality("Auto", src)}
                >
                  <span>Auto</span>
                  {selectedQuality === "Auto" ? <ICheck className="check" /> : null}
                </button>
                {qualityVariants.map((variant) => (
                  <button
                    type="button"
                    key={variant.label + "-" + variant.url}
                    className={"pc-option " + (selectedQuality === variant.label ? "active" : "")}
                    onClick={() => switchQuality(variant.label, variant.url)}
                  >
                    <span>{variant.label}</span>
                    {variant.height ? <span className="pc-quality-note">{variant.height}p</span> : null}
                    {selectedQuality === variant.label ? <ICheck className="check" /> : null}
                  </button>
                ))}
                {!qualityVariants.length ? (
                  <div className="pc-empty">No alternate quality streams are configured.</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="pc-menu-anchor">
            <button
              type="button"
              className="pc-btn pc-menu-btn"
              aria-label="Playback settings"
              aria-expanded={menu === "settings"}
              onClick={() => setMenu(menu === "settings" ? null : "settings")}
              title={`Playback speed: ${rate === 1 ? "Normal" : rate + "x"}`}
            >
              <span className="pc-speed-mark">{rate === 1 ? "1×" : rate + "×"}</span>
            </button>
            {menu === "settings" ? (
              <div className="pc-pop pc-pop-settings">
                <div className="pc-pop-title">PLAYBACK SPEED</div>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    type="button"
                    key={speed}
                    className={"pc-option " + (rate === speed ? "active" : "")}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.playbackRate = speed;
                      setRate(speed);
                      setMenu(null);
                    }}
                  >
                    <span>{speed === 1 ? "Normal" : speed + "x"}</span>
                    {rate === speed ? <ICheck className="check" /> : null}
                  </button>
                ))}
                <div className="pc-pop-title pc-pop-section-gap">EXTERNAL PLAYER</div>
                <button type="button" className="pc-option" onClick={() => void shareStream()}>
                  <span>Share / copy stream URL</span>
                </button>
                {shareStatus ? <div className="pc-empty">{shareStatus}</div> : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="pc-btn"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <ICompress /> : <IExpand />}
          </button>

          {nextEp ? (
            <button
              type="button"
              className="pc-btn wide"
              onClick={() => onEpisode?.(nextEp)}
              aria-label={"Next episode " + nextEp.episode}
            >
              Ep {nextEp.episode}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
