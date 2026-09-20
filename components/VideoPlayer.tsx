"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Episode, MediaItem } from "../lib/types";
import { IAlert, IReplay } from "./icons";

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

type Player = {
  src: (s: {src: string; type?: string}) => void;
  currentTime: (v?: number) => number | undefined;
  duration: () => number;
  paused: () => boolean;
  play: () => Promise<void> | void;
  on: (e: string, cb: (...a: unknown[]) => void) => void;
  off: (e: string, cb: (...a: unknown[]) => void) => void;
  dispose: () => void;
  error: () => {message?: string} | null;
};
type Factory = (el: HTMLVideoElement, options?: Record<string, unknown>) => Player;

declare global { interface Window { videojs?: Factory } }

const VJS = "8.24.1";
const jsUrl = `https://cdn.jsdelivr.net/npm/video.js@${VJS}/dist/video.min.js`;
const cssUrl = `https://cdn.jsdelivr.net/npm/video.js@${VJS}/dist/video-js.min.css`;

function loadVjs(): Promise<Factory> {
  if (window.videojs) return Promise.resolve(window.videojs);
  return new Promise((resolve, reject) => {
    const old = document.querySelector<HTMLScriptElement>("script[data-smart-vjs]");
    if (old) {
      old.addEventListener("load", () => window.videojs ? resolve(window.videojs) : reject(new Error("Video.js failed")), {once:true});
      old.addEventListener("error", () => reject(new Error("Video.js failed to load")), {once:true});
      return;
    }
    const s = document.createElement("script");
    s.src = jsUrl; s.async = true; s.dataset.smartVjs = "1";
    s.onload = () => window.videojs ? resolve(window.videojs) : reject(new Error("Video.js failed"));
    s.onerror = () => reject(new Error("Video.js failed to load"));
    document.head.appendChild(s);
  });
}
function loadCss() {
  if (document.querySelector("link[data-smart-vjs]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = cssUrl; l.dataset.smartVjs = "1";
  document.head.appendChild(l);
}
function typeOf(url: string) {
  const p = url.split("?")[0].toLowerCase();
  if (p.endsWith(".m3u8")) return "application/x-mpegURL";
  if (p.endsWith(".mpd")) return "application/dash+xml";
  if (p.endsWith(".webm")) return "video/webm";
  if (p.endsWith(".ogg") || p.endsWith(".ogv")) return "video/ogg";
  if (p.endsWith(".mp4") || p.endsWith(".m4v")) return "video/mp4";
  return undefined;
}
const source = (src: string) => ({src, type: typeOf(src)});

export function VideoPlayer({
  src, poster, backdrop, title, episodeTitle, demo, subtitleUrl, item, episode,
  onEpisode, initialTime = 0, onProgress, onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const lastSource = useRef(src);
  const initialApplied = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [quality, setQuality] = useState("Auto");

  const variants = useMemo(() => [
    ...(item.qualityVariants ?? []), ...(episode?.qualityVariants ?? [])
  ].filter((v,i,a) => a.findIndex(x => x.label === v.label && x.url === v.url) === i),
  [item.qualityVariants, episode?.qualityVariants]);

  useEffect(() => {
    loadCss();
    let dead = false;
    loadVjs().then(videojs => {
      if (dead || !videoRef.current) return;
      const p = videojs(videoRef.current, {
        controls: true, responsive: true, fluid: true, preload: "metadata",
        playbackRates: [0.5,0.75,1,1.25,1.5,2],
        userActions: {hotkeys: true},
        controlBar: {pictureInPictureToggle: true, volumePanel: {inline: false}},
        html5: {vhs: {overrideNative: true, enableLowInitialPlaylist: true, smoothQualityChange: true}},
      });
      playerRef.current = p;
      p.src(source(src));
      lastSource.current = src;

      const loaded = () => {
        if (dead) return;
        setReady(true); setError(null);
        if (!initialApplied.current && initialTime > 0.5) {
          const d = p.duration();
          p.currentTime(Number.isFinite(d) && d > 0 ? Math.min(initialTime, d - .25) : initialTime);
          initialApplied.current = true;
        }
      };
      const tick = () => {
        const pos = Number(p.currentTime() ?? 0), dur = Number(p.duration() ?? 0);
        if (pos > .5) onProgress?.({position: pos, duration: Number.isFinite(dur) ? dur : 0});
      };
      const fail = () => setError(p.error()?.message || "This browser could not play this media source.");
      p.on("loadedmetadata", loaded); p.on("durationchange", loaded); p.on("error", fail); p.on("ended", () => onEnded?.());
      const timer = window.setInterval(tick, 4000);
      return () => { window.clearInterval(timer); p.off("loadedmetadata", loaded); p.off("durationchange", loaded); p.off("error", fail); };
    }).catch(e => !dead && setError(e instanceof Error ? e.message : "Video.js could not load"));
    return () => {
      dead = true;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || src === lastSource.current) return;
    const pos = Number(p.currentTime() ?? 0), playing = !p.paused();
    p.src(source(src)); lastSource.current = src; setQuality("Auto");
    window.setTimeout(() => {
      if (pos > 0) p.currentTime(pos);
      if (playing) void p.play();
    }, 0);
  }, [src]);

  const changeQuality = (url: string, label: string) => {
    const p = playerRef.current; if (!p) return;
    const pos = Number(p.currentTime() ?? 0), playing = !p.paused();
    setQuality(label); setError(null); p.src(source(url)); lastSource.current = url;
    window.setTimeout(() => { if (pos > 0) p.currentTime(pos); if (playing) void p.play(); }, 0);
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({title, text:"Smart Upload stream", url:lastSource.current});
      else await navigator.clipboard.writeText(lastSource.current);
      setShareStatus("Stream URL copied/shared");
    } catch { setShareStatus(null); }
  };

  const retry = () => {
    const p = playerRef.current; if (!p) return;
    setError(null); p.src(source(lastSource.current)); window.setTimeout(() => void p.play(), 0);
  };

  const eps = item.seasons?.flatMap(s => s.episodes) ?? [];
  const index = episode ? eps.findIndex(e => e.id === episode.id) : -1;
  const prev = index > 0 ? eps[index - 1] : null;
  const next = index >= 0 && index < eps.length - 1 ? eps[index + 1] : null;

  return <div className="smart-videojs-shell">
    <div className="smart-videojs-heading">
      <div className="smart-videojs-title"><strong>{title}</strong>{episodeTitle && <span>{episodeTitle}</span>}</div>
      <div className="smart-videojs-actions">
        {demo && <span className="pill pill-warn">Demo</span>}
        <button className="smart-videojs-action" onClick={() => void share()}>VLC / Share</button>
      </div>
    </div>
    <div className="video-js-host">
      <video ref={videoRef} className="video-js vjs-big-play-centered smart-videojs" playsInline preload="metadata" crossOrigin="anonymous">
        {subtitleUrl && <track kind="subtitles" src={subtitleUrl} srcLang="en" label="English" default />}
      </video>
      {!ready && !error && <div className="smart-videojs-loading"><div className="spinner"/><span>Preparing player…</span></div>}
      {error && <div className="smart-videojs-error" role="alert"><IAlert/><strong>Playback unavailable</strong><span>{error}</span><div className="smart-videojs-error-actions"><button className="btn btn-primary" onClick={retry}><IReplay/> Try again</button><button className="btn btn-secondary" onClick={() => void share()}>Open in VLC / Share</button></div></div>}
    </div>
    {(variants.length || prev || next || shareStatus) ? <div className="smart-videojs-toolbar">
      {variants.length > 0 && <label className="smart-videojs-quality">Quality <select value={quality} onChange={e => { const v=e.target.value; if(v==="Auto") changeQuality(src,"Auto"); else { const x=variants.find(q=>q.label===v); if(x) changeQuality(x.url,x.label); }}}><option>Auto</option>{variants.map(v=><option key={v.label+v.url}>{v.label}</option>)}</select></label>}
      <div className="smart-videojs-spacer"/>
      {shareStatus && <span className="smart-videojs-status">{shareStatus}</span>}
      {prev && onEpisode && <button className="smart-videojs-action" onClick={() => onEpisode(prev)}>Previous</button>}
      {next && onEpisode && <button className="smart-videojs-action" onClick={() => onEpisode(next)}>Next</button>}
    </div> : null}
  </div>;
}
