"use client";

import { useState } from "react";
import type { AudioVariant } from "../lib/types";

export function AudioLanguageControl({
  tracks,
  activeIndex,
  onSelect,
}: {
  tracks: AudioVariant[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = tracks[activeIndex] ?? tracks[0];
  const hasAlternates = tracks.length > 1;
  return (
    <div className="pc-menu-anchor audio-language-control">
      <button
        className={`pc-btn pc-menu-btn audio-language-trigger ${open ? "accent" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Audio language"
        title={active ? `Audio: ${active.label}` : "No alternate audio tracks"}
        disabled={!tracks.length}
      >
        <span className="audio-language-icon" aria-hidden="true">
          {active?.language ? active.language.slice(0, 3).toUpperCase() : "AUDIO"}
        </span>
      </button>

      {open && tracks.length ? (
        <div className="pc-pop audio-language-menu" role="menu">
          <div className="pc-pop-title">
            AUDIO {hasAlternates ? tracks.length + " TRACKS" : "TRACK"}
          </div>
          {tracks.map((track, index) => (
            <button
              key={`${track.url}-${index}`}
              className={`pc-option ${index === activeIndex ? "active" : ""}`}
              onClick={() => {
                onSelect(index);
                setOpen(false);
              }}
              role="menuitemradio"
              aria-checked={index === activeIndex}
            >
              <span>{track.label}</span>
              {index === activeIndex && <span className="audio-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
