"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioVariant, Episode, MediaItem } from "../lib/types";
import {
  IAlert,
  ICheck,
  ICompress,
  IExpand,
  IPause,
  IPlay,
  IReplay,
  ISettings,
  ISkipBack,
  ISkipFwd,
  ISubtitles,
  IVolumeHigh,
  IVolumeLow,
  IVolumeMute,
} from "./icons";
import { SmartImage } from "./SmartImage";

type Menu = "settings" | "audio" | "subtitles" | "quality" | null;

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
  audioTracks?: AudioVariant[];
  preparedBrowserCopy?: boolean;
};

type HlsAudioTrack = {
  id: number;
  name?: string;
  lang?: string;
};

type HlsLevel = {
  height?: number;
  bitrate?: number;
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

const niceAudioLabel = (track: HlsAudioTrack, index: number) => {
  const raw = (track.name || track.lang || "").trim();
  if (raw) return raw;
  return "Audio " + (index + 1);
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
  audioTracks = [],
  preparedBrowserCopy = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const initialedRef = useRef(false);
  const playedRef = useRef(false);
  const currentRef = useRef(0);
  const durationRef = useRef(0);
  const lastEmitRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [hlsReady, setHlsReady] = useState(false);
  const [hlsFailed, setHlsFailed] = useState(false);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<HlsAudioTrack[]>([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(0);
  const [hlsLevels, setHlsLevels] = useState<HlsLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [audioFallback, setAudioFallback] = useState(false);
  const [externalAudioActive, setExternalAudioActive] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<"back" | "forward" | null>(null);

  const usingHls = Boolean(hlsUrl && !hlsFailed);
  const qualityVariants = useMemo(
    () =>
      [
        ...(item.qualityVariants ?? []),
        ...(episode?.qualityVariants ?? []),
      ].filter(
        (variant, index, list) =>
          list.findIndex((v) => v.label === variant.label && v.url === variant.url) === index,
      ),
    [item.qualityVariants, episode?.qualityVariants],
  );

  const externalAudioEnabled =
    !usingHls &&
    audioTracks.length > 0 &&
    !audioFallback &&
    (!preparedBrowserCopy || selectedAudioIndex > 0);

  const externalAudioPlaying = externalAudioEnabled && externalAudioActive;
  const playing = status === "playing";
  const audioOptions = usingHls
    ? hlsAudioTracks.map((track, index) => ({
        label: niceAudioLabel(track, index),
        language: track.lang,
      }))
    : audioTracks;

  useEffect(() => {
    cbRef.current = { onProgress, onEnded };
  }, [onProgress, onEnded]);

  const emitProgress = useCallback((force = false) => {
    if (!playedRef.current) return;
    const now = Date.now();
    if (!force && now - lastEmitRef.current < 4000) return;
    lastEmitRef.current = now;
    cbRef.current.onProgress?.({
      position: currentRef.current,
      duration: durationRef.current,
    });
  }, []);

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (videoRef.current && !videoRef.current.paused) {
      hideTimerRef.current = setTimeout(() => setControls(false), 3200);
    }
  }, []);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
      const next = Math.max(0, Math.min(max, time));
      video.currentTime = next;
      currentRef.current = next;
      setCurrent(next);
      if (externalAudioPlaying && audioRef.current) {
        audioRef.current.currentTime = next;
      }
      emitProgress(true);
    },
    [duration, emitProgress, externalAudioPlaying],
  );

  const changeVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      if (!externalAudioPlaying) videoRef.current.muted = next === 0;
    }
    if (audioRef.current) {
      audioRef.current.volume = next;
      audioRef.current.muted = next === 0;
    }
  }, [externalAudioPlaying]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (externalAudioPlaying && audioRef.current) {
      audioRef.current.muted = next;
      if (videoRef.current) videoRef.current.muted = true;
    } else if (videoRef.current) {
      videoRef.current.muted = next;
    }
  }, [externalAudioPlaying, muted]);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setStarted(true);
    setError(null);
    setBuffering(true);

    if (externalAudioEnabled && audioRef.current) {
      audioRef.current.currentTime = video.currentTime || 0;
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.muted = muted;
      void audioRef.current.play().catch(() => {
        setAudioFallback(true);
        setExternalAudioActive(false);
        video.muted = false;
      });
    }

    void video.play().catch(() => {
      setStarted(false);
      setBuffering(false);
      setError("Playback was blocked. Tap Play again.");
    });
  }, [externalAudioEnabled, muted, volume]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => startPlayback());
    else video.pause();
  }, [startPlayback]);

  const toggleFullscreen = useCallback(() => {
    const element = wrapRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen().catch(() => undefined);
  }, []);

  const selectHlsAudio = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls || !hlsAudioTracks[index]) return;
    hls.audioTrack = index;
    setSelectedAudioIndex(index);
    setMenu(null);
  }, [hlsAudioTracks]);

  const selectDirectAudio = useCallback((index: number) => {
    if (!audioTracks[index]) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    const position = video?.currentTime ?? currentRef.current;
    setSelectedAudioIndex(index);

    const shouldUseExternal = !preparedBrowserCopy || index > 0;
    if (!shouldUseExternal) {
      setAudioFallback(false);
      setExternalAudioActive(false);
      audio?.pause();
      if (video) video.muted = false;
      setMenu(null);
      return;
    }

    if (!audio) return;
    setAudioFallback(false);
    setExternalAudioActive(false);
    audio.src = audioTracks[index].url;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
    audio.load();
    try {
      audio.currentTime = position;
    } catch {}

    if (video && !video.paused) {
      void audio.play().catch(() => {
        setAudioFallback(true);
        setExternalAudioActive(false);
        video.muted = false;
      });
    }
    setMenu(null);
  }, [audioTracks, muted, preparedBrowserCopy, volume]);

  useEffect(() => {
    if (usingHls) {
      setHlsReady(false);
      setHlsFailed(false);
      setHlsAudioTracks([]);
      setHlsLevels([]);
      setSelectedLevel(-1);
    }
  }, [hlsUrl, usingHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let localHls: import("hls.js").default | null = null;

    const startHls = async () => {
      if (!hlsUrl) return;
      setBuffering(true);

      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;

        if (Hls.isSupported()) {
          localHls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            capLevelToPlayerSize: true,
            backBufferLength: 90,
            maxBufferLength: 30,
          });
          hlsRef.current = localHls;

          localHls.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (!disposed) localHls?.loadSource(hlsUrl);
          });

          localHls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
            if (disposed) return;
            const tracks = (localHls?.audioTracks ?? []) as HlsAudioTrack[];
            const levels = (localHls?.levels ?? []) as HlsLevel[];
            setHlsAudioTracks(tracks.map((track, index) => ({
              id: track.id ?? index,
              name: track.name,
              lang: track.lang,
            })));
            setHlsLevels(levels.map((level) => ({
              height: level.height,
              bitrate: level.bitrate,
            })));
            setSelectedAudioIndex(localHls?.audioTrack ?? (tracks.length ? 0 : 0));
            setSelectedLevel(-1);
            setHlsReady(true);
            setBuffering(false);
            video.muted = false;
            if (tracks.length > 0 && localHls && localHls.audioTrack < 0) {
              const defaultIndex = tracks.findIndex(
                (track) => Boolean((track as HlsAudioTrack & { default?: boolean }).default),
              );
              const targetIndex = defaultIndex >= 0 ? defaultIndex : 0;
              localHls.audioTrack = targetIndex;
              setSelectedAudioIndex(targetIndex);
            }
          });

          localHls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
            if (disposed) return;
            const tracks = (localHls?.audioTracks ?? []) as HlsAudioTrack[];
            setHlsAudioTracks(tracks.map((track, index) => ({
              id: track.id ?? index,
              name: track.name,
              lang: track.lang,
            })));

            // Explicitly select the manifest's default audio track. This avoids
            // relying on browser/HLS auto-selection for video-only variants with
            // an EXT-X-MEDIA AAC audio group.
            const defaultIndex = tracks.findIndex(
              (track) => Boolean((track as HlsAudioTrack & { default?: boolean }).default),
            );
            const targetIndex = defaultIndex >= 0 ? defaultIndex : (tracks.length ? 0 : -1);
            if (targetIndex >= 0 && localHls && localHls.audioTrack !== targetIndex) {
              localHls.audioTrack = targetIndex;
              setSelectedAudioIndex(targetIndex);
            }
          });

          localHls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
            if (!disposed && Number.isInteger(data.id)) setSelectedAudioIndex(data.id);
          });

          localHls.on(Hls.Events.ERROR, (_event, data) => {
            if (disposed || !data.fatal) return;

            if (data.type === "networkError") {
              localHls?.startLoad();
              return;
            }

            if (data.type === "mediaError") {
              localHls?.recoverMediaError();
              return;
            }

            setHlsFailed(true);
            setHlsReady(false);
            localHls?.destroy();
            hlsRef.current = null;
            video.removeAttribute("src");
            video.src = src;
            video.load();
            setError(null);
          });

          localHls.attachMedia(video);
          return;
        }

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.load();
          setHlsReady(true);
          return;
        }

        setHlsFailed(true);
      } catch {
        setHlsFailed(true);
        setHlsReady(false);
      }
    };

    if (hlsUrl) {
      void startHls();
    } else {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setHlsReady(false);
      video.src = src;
      video.load();
    }

    return () => {
      disposed = true;
      localHls?.destroy();
      if (hlsRef.current === localHls) hlsRef.current = null;
    };
  }, [hlsUrl, src]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    if (!usingHls && audio && externalAudioEnabled) {
      const track = audioTracks[selectedAudioIndex] ?? audioTracks[0];
      if (track && audio.src !== new URL(track.url, window.location.href).href) {
        audio.src = track.url;
        audio.load();
      }
      video.muted = externalAudioPlaying;
      if (audio) {
        audio.volume = muted ? 0 : volume;
        audio.muted = muted;
      }
      if (!video.paused && started) void audio.play().catch(() => undefined);
    } else if (!externalAudioPlaying) {
      video.muted = false;
    }
  }, [
    audioTracks,
    externalAudioEnabled,
    externalAudioPlaying,
    muted,
    selectedAudioIndex,
    started,
    volume,
    usingHls,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = Array.from(video.textTracks);
    for (const track of tracks) track.mode = "disabled";
    if (ccOn) {
      const track = tracks.find((candidate) => candidate.kind === "subtitles" || candidate.kind === "captions");
      if (track) track.mode = "showing";
    }
  }, [ccOn, subtitleUrl, hlsReady]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key === "Escape" && menu) {
        setMenu(null);
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
  }, [changeVolume, current, menu, seek, toggleFullscreen, toggleMute, togglePlay, volume]);

  const applyInitial = useCallback(() => {
    const video = videoRef.current;
    if (!video || initialedRef.current || !initialTime || initialTime <= 0.5) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const target = Math.min(initialTime, Math.max(0, video.duration - 0.25));
    initialedRef.current = true;
    try {
      video.currentTime = target;
      currentRef.current = video.currentTime;
      setCurrent(video.currentTime);
      if (externalAudioPlaying && audioRef.current) audioRef.current.currentTime = video.currentTime;
    } catch {
      initialedRef.current = false;
    }
  }, [externalAudioPlaying, initialTime]);

  const seekFeedbackShow = useCallback((direction: "back" | "forward") => {
    setSeekFeedback(direction);
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
  }, []);

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!started) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, .pc-pop, .player-close")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const left = event.clientX - rect.left < rect.width / 2;
    const delta = left ? -10 : 10;
    seek((videoRef.current?.currentTime ?? current) + delta);
    seekFeedbackShow(left ? "back" : "forward");
  }, [current, seek, seekFeedbackShow, started]);

  const shareStream = useCallback(async () => {
    try {
      const url = shareUrl ?? src;
      if (navigator.share) {
        await navigator.share({ title, text: "Smart Upload stream", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  }, [shareUrl, src, title]);

  const selectQuality = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (usingHls && hlsReady && hls && hlsLevels[index]) {
      hls.currentLevel = index;
      setSelectedLevel(index);
      setMenu(null);
      return;
    }
  }, [hlsLevels, hlsReady, usingHls]);

  const hasAnyAudio = usingHls ? hlsAudioTracks.length > 0 : audioOptions.length > 0;
  const selectedAudioLabel =
    audioOptions[selectedAudioIndex]?.label ??
    (usingHls ? "Audio" : "EN");

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const hideCursor = !controls && playing;
  const showCenter = !buffering && !error && (status === "paused" || status === "ended" || !started);

  const hasEpisodes = item.kind !== "movie" && Boolean(episode && onEpisode);
  const flatEpisodes = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode ? flatEpisodes.findIndex((candidate) => candidate.id === episode.id) : -1;
  const prevEp =
    hasEpisodes && episodeIndex > 0
      ? flatEpisodes[episodeIndex - 1]
      : null;
  const nextEp =
    hasEpisodes && episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
      ? flatEpisodes[episodeIndex + 1]
      : null;

  return (
    <div
      ref={wrapRef}
      className={"player-wrap " + (hideCursor ? "hidden-cursor" : "")}
      onMouseMove={poke}
      onPointerMove={poke}
      onDoubleClick={handleDoubleClick}
    >
      {!usingHls && audioTracks.length > 0 ? (
        <audio
          ref={audioRef}
          preload="auto"
          aria-hidden="true"
          onPlaying={() => {
            setAudioFallback(false);
            setExternalAudioActive(true);
          }}
          onError={() => {
            setAudioFallback(true);
            setExternalAudioActive(false);
            if (videoRef.current) videoRef.current.muted = false;
          }}
        />
      ) : null}

      <video
        ref={videoRef}
        className="player-video"
        poster={poster ?? backdrop ?? undefined}
        preload="auto"
        playsInline
        onLoadStart={() => setBuffering(true)}
        onPlay={() => {
          setStatus("playing");
          setStarted(true);
          setBuffering(false);
          poke();
          if (externalAudioEnabled && audioRef.current) {
            void audioRef.current.play().catch(() => undefined);
          }
        }}
        onPause={() => {
          setStatus("paused");
          setControls(true);
          emitProgress(true);
          setExternalAudioActive(false);
          audioRef.current?.pause();
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => {
          setBuffering(false);
          applyInitial();
        }}
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
          if (externalAudioPlaying && audioRef.current) {
            const drift = Math.abs(audioRef.current.currentTime - time);
            if (drift > 0.35) audioRef.current.currentTime = time;
          }
          emitProgress();
        }}
        onSeeked={() => {
          if (externalAudioPlaying && audioRef.current) audioRef.current.currentTime = currentRef.current;
          setBuffering(false);
          emitProgress(true);
        }}
        onVolumeChange={(event) => {
          if (externalAudioPlaying) return;
          setMuted(event.currentTarget.muted);
          setVolume(event.currentTarget.volume);
        }}
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onEnded={() => {
          setStatus("ended");
          setControls(true);
          setExternalAudioActive(false);
          audioRef.current?.pause();
          cbRef.current.onEnded?.();
        }}
        onError={() => {
          if (usingHls && !hlsFailed) return;
          setBuffering(false);
          setError("This media could not be decoded. A browser-safe HLS or H.264/AAC stream is required for this file.");
        }}
      >
        {!usingHls ? (
          <source src={src} type={sourceType} />
        ) : null}
        {subtitleUrl ? (
          <track kind="subtitles" src={subtitleUrl} srcLang="en" label="English" />
        ) : null}
      </video>

      <div className={"player-poster " + (started ? "hidden" : "")}>
        <SmartImage src={poster ?? backdrop} alt="" className="player-poster-img" priority sizes="100vw" />
        <div className="player-poster-shade" aria-hidden="true" />
      </div>

      {showCenter ? (
        <div className="player-center">
          <button
            type="button"
            className="big-play"
            onClick={status === "ended" ? () => {
              seek(0);
              startPlayback();
            } : startPlayback}
            aria-label={status === "ended" ? "Replay" : "Play"}
          >
            {status === "ended" ? <IReplay /> : <IPlay />}
          </button>
        </div>
      ) : null}

      {demo ? <span className="pill pill-warn player-demo-badge">Demo preview stream</span> : null}

      <div className={"player-spinner " + (buffering && started ? "" : "hidden")} role="status" aria-label="Buffering">
        <div className="player-loading-orbit" aria-hidden="true">
          <span /><span /><span /><span /><span /><i />
        </div>
        <span className="player-loading-label">{hlsReady ? "Loading stream" : "Loading"}</span>
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
                setStatus("idle");
                setStarted(false);
                setHlsFailed(false);
                videoRef.current?.load();
              }}
            >
              <IReplay /> Try again
            </button>
          </div>
        </div>
      ) : null}

      <div className={"player-topbar " + (controls ? "" : "hidden")}>
        <div className="player-title-block">
          <span className="player-title">{title}</span>
          {episodeTitle ? <span className="player-episode">{episodeTitle}</span> : null}
        </div>
        <span className="player-live-dot" aria-hidden="true" />
        {onClose ? (
          <button type="button" className="player-close" onClick={onClose} aria-label="Exit player">×</button>
        ) : null}
      </div>

      <div className={"player-gradient " + (controls ? "" : "hidden")} />

      {seekFeedback ? (
        <div className={"seek-feedback seek-feedback-" + seekFeedback} aria-live="polite">
          <span className="seek-feedback-icon">{seekFeedback === "back" ? <ISkipBack /> : <ISkipFwd />}</span>
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
        />

        <div className="pc-row">
          <button type="button" className="pc-btn pc-main-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <IPause /> : <IPlay />}
          </button>

          <span className="pc-time">{fmt(current)} / {fmt(duration)}</span>
          <div className="pc-spacer" />

          {prevEp ? (
            <button type="button" className="pc-btn wide" onClick={() => onEpisode?.(prevEp)} aria-label={"Previous episode " + prevEp.episode}>
              <ISkipBack /> Ep {prevEp.episode}
            </button>
          ) : null}

          {nextEp ? (
            <button type="button" className="pc-btn wide" onClick={() => onEpisode?.(nextEp)} aria-label={"Next episode " + nextEp.episode}>
              Ep {nextEp.episode} <ISkipFwd />
            </button>
          ) : null}

          <div className="pc-volume">
            <button
              type="button"
              className="pc-btn"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
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

          {hasAnyAudio ? (
            <div className="pc-menu-anchor audio-language-control">
              <button
                type="button"
                className={"pc-btn pc-menu-btn audio-language-trigger " + (menu === "audio" ? "accent" : "")}
                onClick={() => setMenu(menu === "audio" ? null : "audio")}
                aria-expanded={menu === "audio"}
                aria-haspopup="menu"
                aria-label={"Audio language: " + selectedAudioLabel}
                title={selectedAudioLabel}
              >
                <span className="audio-language-glyph" aria-hidden="true">A</span>
                <span className="audio-language-label">
                  {(audioOptions[selectedAudioIndex]?.language || selectedAudioLabel).slice(0, 2).toUpperCase()}
                </span>
              </button>

              {menu === "audio" ? (
                <div className="pc-pop audio-language-menu" role="menu">
                  <div className="pc-pop-title">AUDIO {audioOptions.length > 1 ? audioOptions.length + " TRACKS" : "TRACK"}</div>
                  {audioOptions.map((track, index) => (
                    <button
                      key={track.label + "-" + index}
                      type="button"
                      className={"pc-option " + (index === selectedAudioIndex ? "active" : "")}
                      onClick={() => usingHls ? selectHlsAudio(index) : selectDirectAudio(index)}
                      role="menuitemradio"
                      aria-checked={index === selectedAudioIndex}
                    >
                      <span>{track.label}</span>
                      {index === selectedAudioIndex ? <ICheck className="check" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {subtitleUrl ? (
            <div className="pc-menu-anchor">
              <button type="button" className={"pc-btn pc-menu-btn " + (ccOn ? "accent" : "")} onClick={() => setMenu(menu === "subtitles" ? null : "subtitles")} aria-expanded={menu === "subtitles"} title="Subtitles">
                <ISubtitles />
              </button>
              {menu === "subtitles" ? (
                <div className="pc-pop">
                  <div className="pc-pop-title">SUBTITLES</div>
                  <button type="button" className={"pc-option " + (ccOn ? "active" : "")} onClick={() => { setCcOn((value) => !value); setMenu(null); }}>
                    <span>English</span>
                    {ccOn ? <ICheck className="check" /> : null}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {usingHls && hlsLevels.length > 0 ? (
            <div className="pc-menu-anchor">
              <button type="button" className={"pc-btn pc-menu-btn pc-label-btn " + (selectedLevel === -1 ? "accent" : "")} onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-expanded={menu === "quality"} title="Video quality">
                <span className="pc-quality-mark">{selectedLevel === -1 ? "AUTO" : (hlsLevels[selectedLevel]?.height ? hlsLevels[selectedLevel].height + "P" : "QUALITY")}</span>
              </button>
              {menu === "quality" ? (
                <div className="pc-pop pc-pop-quality">
                  <div className="pc-pop-title">VIDEO QUALITY</div>
                  <button type="button" className={"pc-option " + (selectedLevel === -1 ? "active" : "")} onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = -1; setSelectedLevel(-1); setMenu(null); }}>
                    <span>Auto</span>
                    {selectedLevel === -1 ? <ICheck className="check" /> : null}
                  </button>
                  {hlsLevels.map((level, index) => (
                    <button key={"hls-" + index} type="button" className={"pc-option " + (selectedLevel === index ? "active" : "")} onClick={() => selectQuality(index)}>
                      <span>{level.height ? level.height + "p" : "Level " + (index + 1)}</span>
                      {selectedLevel === index ? <ICheck className="check" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!usingHls && qualityVariants.length > 0 ? (
            <div className="pc-menu-anchor">
              <button type="button" className="pc-btn pc-menu-btn pc-label-btn" onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-expanded={menu === "quality"} title="Video quality">
                <span className="pc-quality-mark">QUALITY</span>
              </button>
              {menu === "quality" ? (
                <div className="pc-pop pc-pop-quality">
                  <div className="pc-pop-title">VIDEO QUALITY</div>
                  <button type="button" className="pc-option" onClick={() => setMenu(null)}>
                    <span>Auto</span><ICheck className="check" />
                  </button>
                  {qualityVariants.map((variant) => (
                    <button key={variant.label + "-" + variant.url} type="button" className="pc-option" onClick={() => { setMenu(null); window.location.href = variant.url; }}>
                      <span>{variant.label}</span>
                      {variant.height ? <span className="pc-quality-note">{variant.height}p</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <button type="button" className="pc-btn" onClick={shareStream} aria-label="Share stream" title="Share stream">
            <IExpand />
          </button>

          <div className="pc-menu-anchor">
            <button type="button" className={"pc-btn pc-menu-btn " + (menu === "settings" ? "accent" : "")} onClick={() => setMenu(menu === "settings" ? null : "settings")} aria-expanded={menu === "settings"} title="Playback settings">
              <ISettings />
            </button>
            {menu === "settings" ? (
              <div className="pc-pop pc-pop-quality">
                <div className="pc-pop-title">PLAYBACK</div>
                {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                  <button key={value} type="button" className={"pc-option " + (rate === value ? "active" : "")} onClick={() => { if (videoRef.current) videoRef.current.playbackRate = value; setRate(value); setMenu(null); }}>
                    <span>{value}x</span>
                    {rate === value ? <ICheck className="check" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button type="button" className="pc-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <ICompress /> : <IExpand />}
          </button>
        </div>
      </div>
    </div>
  );
}
