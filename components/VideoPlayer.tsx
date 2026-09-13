"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode, MediaItem } from "../lib/types";
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

type Menu = "settings" | null;

type Props = {
  src: string;
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
};

const fmt = (t: number) => {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
};

export function VideoPlayer({
  src,
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
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef(0);
  const durationRef = useRef(0);
  const lastEmitRef = useRef(0);
  const initialedRef = useRef(false);
  const playedRef = useRef(false);
  const cbRef = useRef({ onProgress, onEnded });
  useEffect(() => {
    cbRef.current = { onProgress, onEnded };
  }, [onProgress, onEnded]);

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
  const quality = "Auto";

  const playing = status === "playing";

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const v = videoRef.current;
    if (v && !v.paused) {
      hideTimer.current = setTimeout(() => setControls(false), 3200);
    }
  }, []);

  const wake = useCallback(() => {
    poke();
    setMenu(null);
  }, [poke]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setError("Playback was blocked. Try clicking again."));
    else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(Number.isFinite(duration) ? duration : 1e9, t));
    currentRef.current = v.currentTime;
    setCurrent(v.currentTime);
  }, [duration]);

  const emitProgress = useCallback((force = false) => {
    if (!playedRef.current) return;
    const now = Date.now();
    if (!force && now - lastEmitRef.current < 4000) return;
    const pos = currentRef.current;
    lastEmitRef.current = now;
    if (Number.isFinite(pos) && pos >= 0) {
      cbRef.current.onProgress?.({ position: pos, duration: durationRef.current });
    }
  }, []);

  const applyInitial = useCallback(() => {
    const v = videoRef.current;
    if (!v || initialedRef.current || !initialTime || initialTime <= 0.5) return;
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    v.currentTime = d > 0 ? Math.min(initialTime, d - 0.25) : initialTime;
    currentRef.current = v.currentTime;
    initialedRef.current = true;
  }, [initialTime]);

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    const clamped = Math.max(0, Math.min(1, val));
    if (v) {
      v.volume = clamped;
      v.muted = clamped === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  }, []);

  const startPlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    setError(null);
    void v.play().catch(() => setError("Playback was blocked. Try clicking again."));
  }, []);

  // reset on source change (component is remounted via key)
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // flush the latest position when the player unmounts (e.g. overlay close)
  useEffect(() => {
    return () => {
      emitProgress(true);
    };
  }, [emitProgress]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const hasEpisodes = Boolean(item.kind !== "movie" && episode && onEpisode);
  const episodeIndex =
    episode && onEpisode
      ? item.seasons?.flatMap((s) => s.episodes).findIndex((e) => e.id === episode.id) ?? -1
      : -1;
  const flatEpisodes = item.seasons?.flatMap((s) => s.episodes) ?? [];
  const prevEp = hasEpisodes && episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const nextEp = hasEpisodes && episodeIndex < flatEpisodes.length - 1 ? flatEpisodes[episodeIndex + 1] : null;

  const goEp = (ep: Episode) => {
    if (!onEpisode) return;
    onEpisode(ep);
  };

  // keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (menu) {
        if (e.key === "Escape") setMenu(null);
        return;
      }
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
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
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? current) + 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek((videoRef.current?.currentTime ?? current) - 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume((videoRef.current?.volume ?? volume) + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume((videoRef.current?.volume ?? volume) - 0.1);
          break;
        case "Escape":
          setControls(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, current, volume, playing, togglePlay, toggleMute, toggleFullscreen, seek, changeVolume]);

  const pct = duration ? (current / duration) * 100 : 0;
  const hideCursor = !controls && playing;
  const showCenter = !buffering && !error && (status === "paused" || status === "ended" || !started);

  return (
    <div
      ref={wrapRef}
      className={`player-wrap ${hideCursor ? "hidden-cursor" : ""} controls-on`}
      onMouseMove={wake}
      onTouchStart={wake}
      onPointerMove={wake}
    >
      <video
        ref={videoRef}
        className="player-video"
        src={src}
        poster={poster ?? backdrop ?? undefined}
        preload="metadata"
        playsInline
        onPlay={() => { setStatus("playing"); setBuffering(false); poke(); }}
        onPause={() => { setStatus("paused"); setControls(true); emitProgress(true); }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedData={() => { setBuffering(false); applyInitial(); }}
        onLoadedMetadata={(e) => {
          durationRef.current = e.currentTarget.duration || durationRef.current;
          setDuration(e.currentTarget.duration);
          applyInitial();
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          currentRef.current = t;
          durationRef.current = e.currentTarget.duration || durationRef.current;
          if (t > 0.5) playedRef.current = true;
          setCurrent(t);
          emitProgress();
        }}
        onSeeked={() => emitProgress(true)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
        onEnded={() => { setStatus("ended"); setControls(true); cbRef.current.onEnded?.(); }}
        onError={() => setError("Could not load this media source.")}
      >
        {subtitleUrl && (
          <track kind="subtitles" src={subtitleUrl} srcLang="en" label="English" default={ccOn} />
        )}
      </video>

      {/* poster / start screen */}
      <div className={`player-poster ${started ? "hidden" : ""}`}>
        <SmartImage src={poster ?? backdrop} alt="" className="player-poster-img" priority sizes="100vw" />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg,rgba(0,0,0,.55),transparent 40%)",
            pointerEvents: "none",
          }}
        />
      </div>
      {!started && (
        <div className="player-center">
          <button className="big-play" onClick={startPlayback} aria-label={`Play ${episodeTitle ?? title}`}>
            <IPlay />
          </button>
        </div>
      )}

      {demo && (
        <span className="pill pill-warn player-demo-badge">Demo preview stream</span>
      )}

      {/* buffering */}
      <div className={`player-spinner ${buffering && started ? "" : "hidden"}`} role="status" aria-label="Buffering">
        <div className="spinner" />
      </div>

      {/* error */}
      {error && (
        <div className="player-error" role="alert">
          <IAlert />
          <h3>Playback unavailable</h3>
          <p>{error}</p>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => { setError(null); setStarted(false); }}>
              <IReplay /> Try again
            </button>
            {demo && <span className="pill pill-warn">Demo stream offline — configure your media URL</span>}
          </div>
        </div>
      )}

      {/* pause overlay */}
      {showCenter && started && !error && status !== "ended" && (
        <div className="player-center">
          <button className="big-play" onClick={togglePlay} aria-label="Play">
            <IPlay />
          </button>
        </div>
      )}
      {showCenter && status === "ended" && (
        <div className="player-center">
          <button className="big-play" onClick={() => { const v = videoRef.current; if (v) { v.currentTime = 0; void v.play(); } }} aria-label="Replay">
            <IReplay />
          </button>
        </div>
      )}

      <div className={`player-gradient ${controls ? "" : "hidden"}`} />
      <div className={`player-controls ${controls ? "" : "hidden"}`}>
        <input
          className="slider pc-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ "--fill": `${pct}%` } as React.CSSProperties}
          aria-label="Seek"
          aria-valuetext={fmt(current)}
        />

        <div className="pc-row">
          <button className="pc-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <IPause /> : <IPlay />}
          </button>
          <button className="pc-btn" onClick={() => seek((videoRef.current?.currentTime ?? current) - 10)} aria-label="Back 10 seconds">
            <ISkipBack style={{ transform: "scaleX(-1)" }} />
          </button>
          <button className="pc-btn" onClick={() => seek((videoRef.current?.currentTime ?? current) + 10)} aria-label="Forward 10 seconds">
            <ISkipFwd />
          </button>
          <span className="pc-time">
            {fmt(current)} / {fmt(duration)}
          </span>

          <div className="pc-spacer" />

          {prevEp && (
            <button className="pc-btn wide" onClick={() => goEp(prevEp)} aria-label={`Previous: ${prevEp.title}`}>
              <ISkipBack /> Ep {prevEp.episode}
            </button>
          )}

          <div style={{ position: "relative" }}>
            <button
              className="pc-btn"
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              onClick={toggleMute}
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
              onChange={(e) => changeVolume(Number(e.target.value))}
              style={{ "--fill": `${muted ? 0 : volume * 100}%` } as React.CSSProperties}
              aria-label="Volume"
            />
          </div>

          <button
            className={`pc-btn ${ccOn ? "accent" : ""}`}
            aria-label={subtitleUrl ? (ccOn ? "Disable subtitles" : "Enable subtitles") : "Subtitles"}
            aria-pressed={ccOn}
            onClick={() => {
              if (subtitleUrl) {
                setCcOn((v) => !v);
                setMenu(null);
              } else {
                setMenu("settings");
              }
            }}
          >
            <ISubtitles />
          </button>

          <div style={{ position: "relative" }}>
            <button
              className="pc-btn"
              aria-label="Settings"
              aria-expanded={menu === "settings"}
              onClick={() => setMenu(menu === "settings" ? null : "settings")}
            >
              <ISettings />
            </button>
            {menu === "settings" && (
              <div className="pc-pop">
                <div className="pc-pop-head">Playback Speed</div>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    className={`pc-option ${rate === r ? "active" : ""}`}
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) v.playbackRate = r;
                      setRate(r);
                    }}
                  >
                    <span>{r === 1 ? "Normal" : `${r}x`}</span>
                    <ICheck className="check" />
                  </button>
                ))}
                <div className="pc-pop-head" style={{ marginTop: ".4em" }}>Quality</div>
                <button className="pc-option active" disabled aria-disabled>
                  <span>{quality}</span>
                  <ICheck className="check" />
                </button>
                <button className="pc-option" disabled aria-disabled title="Quality switches arrive once a real stream is configured">
                  <span className="sub small">1080p / 720p / 480p …</span>
                </button>
                <div className="pc-pop-head" style={{ marginTop: ".4em" }}>Subtitles</div>
                {subtitleUrl ? (
                  <button className={`pc-option ${ccOn ? "active" : ""}`} onClick={() => { setCcOn((v) => !v); setMenu(null); }}>
                    <span>English</span>
                    <ICheck className="check" />
                  </button>
                ) : (
                  <button className="pc-option" disabled aria-disabled>
                    <span className="sub small">No subtitles in preview</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button className="pc-btn" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
            {fullscreen ? <ICompress /> : <IExpand />}
          </button>

          {nextEp && (
            <button className="pc-btn wide" onClick={() => goEp(nextEp)} aria-label={`Next: ${nextEp.title}`}>
              Ep {nextEp.episode} <ISkipFwd style={{ transform: "scaleX(-1)" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}