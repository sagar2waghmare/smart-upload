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
    el.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  return (
    <section className="secao-conteudos" aria-label={title}>
      <div className="titulo-secao">
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
      <div className="lista-conteudos" ref={scrollRef}>
        {items.map((m, index) => (
          <MediaCard key={m.id} item={m} priority={index === 0 && title === "Movies"} />
        ))}
      </div>
    </section>
  );
}
