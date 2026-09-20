"use client";

import { useRef } from "react";
import type { MediaItem } from "../lib/types";
import { MediaCard } from "./MediaCard";

export function Rail({ title, items }: { title: string; items: MediaItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!items.length) return null;

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" });
  };

  return (
    <section className="source-netflix-row" aria-label={title}>
      <div className="source-netflix-row-title">
        <h2>{title}</h2>
      </div>
      <div className="source-netflix-poster-list" ref={ref}>
        {items.map((item) => <MediaCard key={item.id} item={item} />)}
      </div>
      <div className="source-netflix-row-controls">
        <button type="button" onClick={() => scroll("left")} aria-label="Previous">‹</button>
        <button type="button" onClick={() => scroll("right")} aria-label="Next">›</button>
      </div>
    </section>
  );
}
