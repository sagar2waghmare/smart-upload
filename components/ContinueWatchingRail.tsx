"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { IImage, IPlay, IStar } from "./icons";
import { useDetails } from "./DetailsProvider";
import { progressPercent, useWatchProgress, type WatchProgress } from "../lib/watch-progress";

export function ContinueWatchingRail() {
  const progress = useWatchProgress();
  const { openDetails } = useDetails();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((library) => { if (alive) setItems(library); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const active = (items ?? [])
    .map((m) => ({ m, p: progress[m.id] }))
    .filter((x): x is { m: MediaItem; p: WatchProgress } => {
      if (!x.p || x.p.duration <= 0) return false;
      const pct = progressPercent(x.p);
      return pct >= 5 && pct < 95;
    })
    .sort((a, b) => b.p.updatedAt - a.p.updatedAt);

  if (!active.length) return null;

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" });
  };

  return (
    <section className="source-netflix-row" aria-label="Continue Watching">
      <h2>Continue Watching</h2>
      <div className="source-netflix-continue-list" ref={ref}>
        {active.map(({ m, p }) => {
          const pct = progressPercent(p);
          const episode = m.seasons?.flatMap((s) => s.episodes).find((e) => e.id === p.episodeId);

          return (
            <button
              type="button"
              className="source-netflix-continue-card"
              key={m.id}
              onClick={() => openDetails(m)}
              aria-label={"Continue watching " + m.title}
            >
              <span className="source-netflix-continue-art">
                <img src={m.backdrop ?? m.poster} alt="" />
                <span className="source-netflix-continue-gradient" />
                <span className="source-netflix-continue-play"><IPlay /></span>
                <span className="source-netflix-progress">
                  <span style={{ width: Math.min(100, Math.max(0, pct)) + "%" }} />
                </span>
              </span>
              <span className="source-netflix-continue-footer">
                <span>
                  {m.kind === "series" && episode ? "S" + episode.season + ":E" + episode.episode : "Movie"}
                </span>
                <span className="source-netflix-continue-actions" aria-hidden="true">
                  <IImage /><IStar /><IPlay />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="source-netflix-row-controls">
        <button type="button" onClick={() => scroll("left")} aria-label="Scroll left">‹</button>
        <button type="button" onClick={() => scroll("right")} aria-label="Scroll right">›</button>
      </div>
    </section>
  );
}
