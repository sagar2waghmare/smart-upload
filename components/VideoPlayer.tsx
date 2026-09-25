"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { IArrowLeft, IArrowRight, IClose, ILink } from "./icons";
import type { Episode, MediaItem } from "../lib/types";
import styles from "./VideoPlayer.module.css";

const H265WEB_SCRIPT = "https://h265web.com/static/h265web.js";
const H265WEB_BASE = "https://h265web.com/static/";

type H265Player = {
  build(config: Record<string, unknown>): void;
  load_media(url: string): void;
  play(): void | Promise<unknown>;
  pause(): void | Promise<unknown>;
  seek(seconds: number): void | Promise<unknown>;
  set_playback_rate(rate: number): void | Promise<unknown>;
  set_voice(volume: number): void | Promise<unknown>;
  release?(): void;
  on_ready_show_done_callback?: () => void;
  video_probe_callback?: (info: Record<string, unknown>) => void;
  on_play_time?: (seconds: number) => void;
  on_play_finished?: () => void;
  on_load_caching_callback?: (data: unknown) => void;
  on_finish_cache_callback?: (data: unknown) => void;
  on_seek_done_callback?: (seconds: number) => void;
  on_error_callback?: (error: unknown) => void;
};

declare global {
  interface Window {
    H265webjsPlayer?: () => H265Player;
  }
}

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

type PlayerState = "loading" | "ready" | "playing" | "paused" | "buffering" | "error";
type SubtitleCue = { start: number; end: number; text: string };

let sdkPromise: Promise<void> | null = null;

function loadH265Web(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser playback is unavailable."));
  if (window.H265webjsPlayer) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-smart-h265="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Playback engine failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = H265WEB_SCRIPT;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.smartH265 = "true";
    script.onload = () => {
      if (window.H265webjsPlayer) resolve();
      else reject(new Error("Playback engine loaded without an SDK."));
    };
    script.onerror = () => reject(new Error("Playback engine failed to load."));
    document.head.appendChild(script);
  }).finally(() => {
    sdkPromise = null;
  });

  return sdkPromise;
}

function parseCueTime(raw: string): number | null {
  const parts = raw.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((value) => !Number.isFinite(value)) || parts.length < 2 || parts.length > 3) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseVtt(text: string): SubtitleCue[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})/);
    if (!match) continue;

    const start = parseCueTime(match[1]);
    const end = parseCueTime(match[2]);
    if (start === null || end === null || end <= start) continue;

    const body: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].trim(); j += 1) {
      body.push(lines[j]);
      i = j;
    }

    const cueText = body.join("\n").replace(/<[^>]+>/g, "").trim();
    if (cueText) cues.push({ start, end, text: cueText });
  }

  return cues;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0")
    : minutes + ":" + String(seconds).padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function VideoPlayer({
  src,
  hlsUrl,
  sourceType,
  shareUrl,
  poster,
  title,
  logo,
  episodeTitle,
  subtitleUrl,
  item,
  episode,
  onEpisode,
  initialTime = 0,
  onProgress,
  onEnded,
  onClose,
  preparedBrowserCopy = false,
  autoplay = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<H265Player | null>(null);
  const durationRef = useRef(0);
  const timeRef = useRef(initialTime);
  const reportAtRef = useRef(0);
  const volumeRef = useRef(1);
  const engineId = "smart-h265-" + useId().replace(/:/g, "");

  const [state, setState] = useState<PlayerState>("loading");
  const [nativeFallback, setNativeFallback] = useState(false);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(Boolean(autoplay));
  const [controls, setControls] = useState(true);
  const [subtitleOn, setSubtitleOn] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);

  const activeSource = hlsUrl && !preparedBrowserCopy ? hlsUrl : src;
  const subtitleText = subtitleOn
    ? (subtitles.find((cue) => time >= cue.start && time < cue.end)?.text ?? "")
    : "";

  const reportProgress = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - reportAtRef.current < 4000) return;
    reportAtRef.current = now;
    onProgress?.({
      position: timeRef.current,
      duration: durationRef.current,
    });
  }, [onProgress]);

  const releasePlayer = useCallback(() => {
    try {
      playerRef.current?.release?.();
    } catch {}
    playerRef.current = null;
  }, []);

  useEffect(() => {
    if (!subtitleUrl) {
      setSubtitles([]);
      return;
    }

    let cancelled = false;
    fetch(subtitleUrl, { credentials: "same-origin" })
      .then((response) => response.ok ? response.text() : "")
      .then((text) => {
        if (!cancelled) setSubtitles(text ? parseVtt(text) : []);
      })
      .catch(() => {
        if (!cancelled) setSubtitles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl]);

  useEffect(() => {
    setNativeFallback(false);
    setError("");
    setState("loading");
    setTime(initialTime);
    timeRef.current = initialTime;
    durationRef.current = 0;
    setDuration(0);

    let cancelled = false;

    const start = async () => {
      try {
        await loadH265Web();
        if (cancelled || !engineRef.current || !window.H265webjsPlayer) return;

        engineRef.current.innerHTML = "";
        const player = window.H265webjsPlayer();
        playerRef.current = player;

        player.on_ready_show_done_callback = () => {
          if (cancelled) return;
          setState("ready");
          if (autoplay) {
            try {
              player.set_voice(0);
              setMuted(true);
              player.play();
              window.setTimeout(() => {
                if (cancelled) return;
                try {
                  player.set_voice(volumeRef.current);
                  setMuted(false);
                  setState("playing");
                } catch {}
              }, 450);
            } catch {}
          }
        };

        player.video_probe_callback = (info) => {
          if (cancelled) return;
          const value = Number(info.duration ?? info.media_duration ?? info.duration_seconds);
          if (!Number.isFinite(value) || value <= 0) return;
          durationRef.current = value;
          setDuration(value);

          if (initialTime > 0.5) {
            window.setTimeout(() => {
              try {
                player.seek(Math.min(initialTime, Math.max(0, value - 0.25)));
              } catch {}
            }, 80);
          }
        };

        player.on_play_time = (seconds) => {
          if (cancelled) return;
          const value = Number(seconds);
          if (!Number.isFinite(value)) return;
          timeRef.current = value;
          setTime(value);
          setState((current) => current === "ready" || current === "buffering" ? "playing" : current);
          reportProgress(false);
        };

        player.on_load_caching_callback = () => {
          if (!cancelled) setState("buffering");
        };

        player.on_finish_cache_callback = () => {
          if (!cancelled) setState("playing");
        };

        player.on_seek_done_callback = (seconds) => {
          if (cancelled) return;
          const value = Number(seconds);
          if (!Number.isFinite(value)) return;
          timeRef.current = value;
          setTime(value);
          reportProgress(true);
        };

        player.on_play_finished = () => {
          if (cancelled) return;
          setState("paused");
          reportProgress(true);
          onEnded?.();
        };

        player.on_error_callback = (message) => {
          if (cancelled) return;
          setError(typeof message === "string" ? message : "The media could not be decoded by the browser engine.");
          setState("error");
        };

        player.build({
          player_id: engineRef.current.id,
          base_url: H265WEB_BASE,
          wasm_js_uri: "h265web_wasm.js",
          wasm_wasm_uri: "h265web_wasm.wasm",
          ext_src_js_uri: "extjs.js",
          ext_wasm_js_uri: "extwasm.js",
          width: "100%",
          height: "100%",
          color: "#05070b",
          auto_play: false,
          ignore_audio: false,
          hls_strategy: "auto",
          readframe_multi_times: -1,
        });

        player.load_media(activeSource);
      } catch (err) {
        if (cancelled) return;
        releasePlayer();
        setNativeFallback(true);
        setState("loading");
        setError(err instanceof Error ? err.message : "Playback engine unavailable.");
      }
    };

    void start();

    return () => {
      cancelled = true;
      releasePlayer();
    };
  }, [activeSource, autoplay, initialTime, onEnded, releasePlayer, reportProgress]);

  const seek = useCallback((nextTime: number) => {
    const safe = clamp(nextTime, 0, durationRef.current || nextTime);
    timeRef.current = safe;
    setTime(safe);

    if (nativeFallback) {
      const video = rootRef.current?.querySelector("video");
      if (video instanceof HTMLVideoElement) {
        try { video.currentTime = safe; } catch {}
      }
    } else {
      try { playerRef.current?.seek(safe); } catch {}
    }

    reportProgress(true);
  }, [nativeFallback, reportProgress]);

  const togglePlay = useCallback(() => {
    if (nativeFallback) {
      const video = rootRef.current?.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.paused) {
        void video.play().then(() => setState("playing")).catch(() => undefined);
      } else {
        video.pause();
        setState("paused");
      }
      return;
    }

    if (state === "playing") {
      try { playerRef.current?.pause(); } catch {}
      setState("paused");
      return;
    }

    try {
      playerRef.current?.play();
      setState("playing");
    } catch {
      setNativeFallback(true);
    }
  }, [nativeFallback, state]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      playerRef.current?.set_voice(next ? 0 : volume);
    } catch {}
    const video = rootRef.current?.querySelector("video");
    if (video instanceof HTMLVideoElement) video.muted = next;
  }, [muted, volume]);

  const changeVolume = useCallback((next: number) => {
    const value = clamp(next, 0, 1);
    volumeRef.current = value;
    setVolume(value);
    if (value > 0) setMuted(false);
    try { playerRef.current?.set_voice(value); } catch {}
    const video = rootRef.current?.querySelector("video");
    if (video instanceof HTMLVideoElement) video.volume = value;
  }, []);

  const changeSpeed = useCallback((next: number) => {
    setSpeed(next);
    try { playerRef.current?.set_playback_rate(next); } catch {}
    const video = rootRef.current?.querySelector("video");
    if (video instanceof HTMLVideoElement) video.playbackRate = next;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await root.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(time - 10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(time + 10);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMute();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [seek, time, toggleFullscreen, toggleMute, togglePlay]);

  const progress = duration > 0 ? (time / duration) * 100 : 0;
  const progressStyle = { "--progress": Math.min(100, Math.max(0, progress)) + "%" } as CSSProperties;

  const episodeList = item.seasons?.flatMap((season) => season.episodes) ?? [];
  const episodeIndex = episode ? episodeList.findIndex((candidate) => candidate.id === episode.id) : -1;
  const previousEpisode = episodeIndex > 0 ? episodeList[episodeIndex - 1] : null;
  const nextEpisode = episodeIndex >= 0 && episodeIndex < episodeList.length - 1 ? episodeList[episodeIndex + 1] : null;

  const nativeError = () => {
    setState("error");
    setError("This browser could not decode the selected source.");
  };

  return (
    <div
      ref={rootRef}
      className={styles.player}
      tabIndex={0}
      onPointerMove={() => setControls(true)}
      onMouseLeave={() => {
        if (state === "playing") setControls(false);
      }}
      onClick={() => setShowSpeed(false)}
    >
      <div ref={engineRef} id={engineId} className={styles.engine} />

      {nativeFallback ? (
        <video
          className={styles.nativeVideo}
          src={activeSource}
          poster={poster ?? undefined}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            durationRef.current = Number.isFinite(video.duration) ? video.duration : 0;
            setDuration(durationRef.current);
            if (initialTime > 0.5) {
              try { video.currentTime = Math.min(initialTime, Math.max(0, video.duration - 0.25)); } catch {}
            }
            setState("ready");
            if (autoplay) void video.play().then(() => setState("playing")).catch(() => undefined);
          }}
          onPlaying={() => setState("playing")}
          onPause={() => setState("paused")}
          onWaiting={() => setState("buffering")}
          onTimeUpdate={(event) => {
            const value = event.currentTarget.currentTime;
            timeRef.current = value;
            setTime(value);
            reportProgress(false);
          }}
          onEnded={() => {
            setState("paused");
            reportProgress(true);
            onEnded?.();
          }}
          onError={nativeError}
        />
      ) : null}

      <div className={styles.scrim} />

      {logo ? (
        <div className={styles.logoWrap}>
          <img src={logo} alt="" className={styles.logo} />
        </div>
      ) : (
        <div className={styles.titleWrap}>
          <strong>{title}</strong>
          {episodeTitle ? <span>{episodeTitle}</span> : null}
        </div>
      )}

      <div className={styles.topbar}>
        <button type="button" className={styles.iconButton} onClick={(event) => { event.stopPropagation(); onClose?.(); }} aria-label="Close">
          <IClose />
        </button>

        <div className={styles.context}>
          <span>NOW PLAYING</span>
          <strong>{episodeTitle ? title + " · " + episodeTitle : title}</strong>
          <small>{preparedBrowserCopy ? "Browser-ready copy" : sourceType || "Original source"}</small>
        </div>

        <div className={styles.actions}>
          {previousEpisode ? (
            <button type="button" className={styles.iconButton} onClick={(event) => { event.stopPropagation(); onEpisode?.(previousEpisode); }} aria-label="Previous episode">
              <IArrowLeft />
            </button>
          ) : null}
          {nextEpisode ? (
            <button type="button" className={styles.iconButton} onClick={(event) => { event.stopPropagation(); onEpisode?.(nextEpisode); }} aria-label="Next episode">
              <IArrowRight />
            </button>
          ) : null}
          {shareUrl || src ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={(event) => {
                event.stopPropagation();
                const url = shareUrl || src;
                if (navigator.share) void navigator.share({ title, url }).catch(() => undefined);
                else void navigator.clipboard?.writeText(url);
              }}
              aria-label="Share"
            >
              <ILink />
            </button>
          ) : null}
        </div>
      </div>

      {subtitleText ? <div className={styles.subtitle}>{subtitleText}</div> : null}

      {state === "loading" || state === "buffering" ? (
        <div className={styles.centerState}>
          {logo ? <img src={logo} className={styles.loadingLogo} alt="" /> : <strong>{title}</strong>}
          <span>{state === "buffering" ? "Buffering" : "Preparing playback"}</span>
        </div>
      ) : null}

      {state === "error" ? (
        <div className={styles.centerState}>
          {logo ? <img src={logo} className={styles.loadingLogo} alt="" /> : <strong>{title}</strong>}
          <span>{error || "Playback unavailable"}</span>
          <button type="button" className={styles.retry} onClick={(event) => { event.stopPropagation(); setNativeFallback(true); setState("loading"); }}>
            Try browser playback
          </button>
        </div>
      ) : null}

      {controls ? (
        <div className={styles.controls} onClick={(event) => event.stopPropagation()}>
          <div className={styles.progressRow}>
            <span>{formatTime(time)}</span>
            <input
              className={styles.progress}
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.1}
              value={Math.min(time, Math.max(duration, 0))}
              onChange={(event) => seek(Number(event.target.value))}
              style={progressStyle}
              aria-label="Seek"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className={styles.bottomRow}>
            <div className={styles.leftControls}>
              <button type="button" className={styles.primaryButton} onClick={togglePlay} aria-label={state === "playing" ? "Pause" : "Play"}>
                {state === "playing" ? "Ⅱ" : "▶"}
              </button>
              <button type="button" className={styles.textButton} onClick={() => seek(time - 10)}>−10</button>
              <button type="button" className={styles.textButton} onClick={() => seek(time + 10)}>+10</button>
              <button type="button" className={styles.iconButtonSmall} onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? "🔇" : "🔊"}
              </button>
              <input
                className={styles.volume}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="Volume"
              />
            </div>

            <div className={styles.rightControls}>
              {subtitleUrl ? (
                <button type="button" className={subtitleOn ? styles.activeButton : styles.textButton} onClick={() => setSubtitleOn((value) => !value)}>
                  CC
                </button>
              ) : null}

              <div className={styles.menuWrap}>
                <button type="button" className={speed !== 1 ? styles.activeButton : styles.textButton} onClick={() => setShowSpeed((value) => !value)}>
                  {speed}×
                </button>
                {showSpeed ? (
                  <div className={styles.menu}>
                    {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        type="button"
                        key={rate}
                        className={rate === speed ? styles.menuActive : undefined}
                        onClick={() => { changeSpeed(rate); setShowSpeed(false); }}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button type="button" className={styles.iconButtonSmall} onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
                ⛶
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {controls && state !== "error" ? (
        <button type="button" className={styles.centerPlay} onClick={togglePlay} aria-label={state === "playing" ? "Pause" : "Play"}>
          {state === "playing" ? "Ⅱ" : "▶"}
        </button>
      ) : null}
    </div>
  );
}
