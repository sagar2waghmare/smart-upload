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
  if (!tracks.length) return null;

  const active = tracks[activeIndex] ?? tracks[0];
  return (
    <div className="pc-menu-anchor audio-language-control">
      <button
        className={`pc-btn pc-menu-btn audio-language-trigger ${open ? "accent" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Audio language"
        title={`Audio: ${active.label}`}
      >
        <span className="audio-language-icon" aria-hidden="true">A</span>
      </button>

      {open && (
        <div className="pc-pop audio-language-menu" role="menu">
          <div className="pc-pop-title">AUDIO</div>
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
