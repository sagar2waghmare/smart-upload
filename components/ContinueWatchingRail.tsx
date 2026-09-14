"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { MediaCard } from "./MediaCard";
import { IPlay } from "./icons";
import { progressPercent, useWatchProgress, type WatchProgress } from "../lib/watch-progress";

export function ContinueWatchingRail({ title = "Continue Watching", seeAll }: { title?: string; seeAll?: string }) {
  const progress = useWatchProgress();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadLibrary()
      .then((ls) => {
        if (alive) setItems(ls);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = (items ?? [])
    .map((m) => ({ m, p: progress[m.id] }))
    .filter((x): x is { m: MediaItem; p: WatchProgress } => {
      if (!x.p || x.p.duration <= 0) return false;
      const pct = progressPercent(x.p);
      return pct >= 5 && pct < 95;
    })
    .sort((a, b) => b.p.updatedAt - a.p.updatedAt)
    .map((x) => x.m);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  if (!active.length) {
    return (
      <section className="secao-conteudos" aria-label={title}>
        <div className="titulo-secao">
          <h2><IPlay style={{ width: "1.1em", height: "1.1em" }} /> {title}</h2>
        </div>
        <div className="continue-empty">
          <p className="continue-empty-text">
            Nothing in progress yet. Start watching something and unfinished titles will appear here.
          </p>
          {seeAll && (
            <Link href={seeAll} className="continue-empty-link">
              Browse library
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="secao-conteudos" aria-label={title}>
      <div className="titulo-secao">
        <h2><IPlay style={{ width: "1.1em", height: "1.1em" }} /> {title}</h2>
        {seeAll ? (
          <Link href={seeAll}>Ver tudo</Link>
        ) : (
          <div className="controles-carrossel">
            <button onClick={() => scroll("left")} aria-label="Scroll left">‹</button>
            <button onClick={() => scroll("right")} aria-label="Scroll right">›</button>
          </div>
        )}
      </div>
      <div className="lista-conteudos" ref={scrollRef}>
        {active.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    </section>
  );
}
