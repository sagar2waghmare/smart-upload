"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { MediaCard } from "./MediaCard";
import { IArrowRight, IPlay } from "./icons";
import { progressPercent, useWatchProgress, type WatchProgress } from "../lib/watch-progress";

export function ContinueWatchingRail({ title = "Continue Watching", seeAll }: { title?: string; seeAll?: string }) {
  const progress = useWatchProgress();
  const [items, setItems] = useState<MediaItem[] | null>(null);

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

  if (!active.length) return null;

  return (
    <section className="section rail-edge" aria-label={title}>
      <div className="section-head">
        <h2>
          <IPlay style={{ color: "var(--accent-bright)", width: "1.1em", height: "1.1em" }} />
          {title}
        </h2>
        {seeAll && (
          <Link href={seeAll} className="see-all">
            See all <IArrowRight />
          </Link>
        )}
      </div>
      <div className="rail">
        {active.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    </section>
  );
}