"use client";

import { useState } from "react";
import type { AudioVariant } from "../lib/types";

function compactLabel(track?: AudioVariant): string {
  if (!track) return "AUDIO";
  const language = (track.language ?? "").trim().toLowerCase();
  if (language) return language.slice(0, 3).toUpperCase();
  const label = track.label.trim();
  if (!label) return "AUDIO";
  return label.length <= 6 ? label.toUpperCase() : label.slice(0, 5).toUpperCase();
}

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
  const buttonLabel = compactLabel(active);

  return (
    <div className="pc-menu-anchor audio-language-control">
      <button
        type="button"
        className={`pc-btn pc-menu-btn audio-language-trigger ${open ? "accent" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Audio language"
        title={active ? `Audio: ${active.label}` : "Audio tracks"}
      >
        <span className="audio-language-icon" aria-hidden="true">{buttonLabel}</span>
      </button>

      {open ? (
        <div className="pc-pop audio-language-menu" role="menu">
          <div className="pc-pop-title">
            AUDIO {hasAlternates ? `${tracks.length} TRACKS` : "TRACKS"}
          </div>

          {tracks.length ? (
            tracks.map((track, index) => (
              <button
                type="button"
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
                {index === activeIndex ? (
                  <span className="audio-check" aria-hidden="true">✓</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="pc-empty">
              No alternate AAC audio tracks are prepared for this video.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
