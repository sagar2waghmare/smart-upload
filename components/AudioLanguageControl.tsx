"use client";

import { useEffect, useState } from "react";

interface TrackInfo {
  index: number;
  label: string;
  language: string;
  enabled: boolean;
}

export function AudioLanguageControl() {
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const scan = () => {
      const video = document.querySelector(".player-video") as (HTMLVideoElement & { audioTracks?: any }) | null;
      const list = video?.audioTracks;
      if (!list || typeof list.length !== "number") {
        setTracks([]);
        return;
      }
      const next: TrackInfo[] = [];
      for (let i = 0; i < list.length; i += 1) {
        const track = list[i];
        next.push({
          index: i,
          label: track.label || track.language || `Audio ${i + 1}`,
          language: track.language || "",
          enabled: Boolean(track.enabled),
        });
      }
      setTracks(next);
    };
    scan();
    const timer = window.setInterval(scan, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (tracks.length < 2) return null;

  const select = (index: number) => {
    const video = document.querySelector(".player-video") as (HTMLVideoElement & { audioTracks?: any }) | null;
    const list = video?.audioTracks;
    if (!list) return;
    for (let i = 0; i < list.length; i += 1) list[i].enabled = i === index;
    setTracks((current) => current.map((track) => ({ ...track, enabled: track.index === index })));
    setOpen(false);
  };

  const active = tracks.find((track) => track.enabled) ?? tracks[0];

  return (
    <div className="audio-language-control">
      <button className="pc-btn audio-language-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Audio language">
        <span className="audio-language-short">{active?.language?.toUpperCase() || "AUDIO"}</span>
      </button>
      {open && (
        <div className="audio-language-menu" role="menu">
          <div className="pc-pop-head">Audio language</div>
          {tracks.map((track) => (
            <button key={`${track.index}-${track.language}`} className={`pc-option ${track.enabled ? "active" : ""}`} onClick={() => select(track.index)} role="menuitemradio" aria-checked={track.enabled}>
              <span>{track.label}</span>
              {track.enabled && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
