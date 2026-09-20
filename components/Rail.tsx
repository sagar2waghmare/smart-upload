"use client";

import Link from "next/link";
import { useRef } from "react";
import type { MediaItem } from "../lib/types";
import { MediaCard } from "./MediaCard";

export function Rail({ title, items, seeAll }: { title: string; items: MediaItem[]; seeAll?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!items.length) return null;

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -620 : 620, behavior: "smooth" });
  };

  return (
    <section className="secao-conteudos nf-rail" aria-label={title}>
      <div className="titulo-secao nf-rail-title">
        <h2>{title}</h2>
        {seeAll ? (
          <Link href={seeAll}>See all</Link>
        ) : (
          <div className="controles-carrossel">
            <button onClick={() => scroll("left")} aria-label="Scroll left">‹</button>
            <button onClick={() => scroll("right")} aria-label="Scroll right">›</button>
          </div>
        )}
      </div>
      <div className="lista-conteudos nf-poster-list" ref={scrollRef}>
        {items.map((m) => <MediaCard key={m.id} item={m} />)}
      </div>
    </section>
  );
}
