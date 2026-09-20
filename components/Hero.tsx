"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IInfo, IPlay } from "./icons";

const AUTO_DURATION = 7000;

export function Hero({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  const count = items.length;
  const [index, setIndex] = useState(0);

  const go = useCallback((next: number) => {
    if (!count) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % count), AUTO_DURATION);
    return () => window.clearInterval(id);
  }, [count]);

  if (!count) return null;
  const active = items[index];
  const tags = (active.genres ?? []).slice(0, 3);

  return (
    <section className="source-netflix-hero" aria-roledescription="carousel" aria-label="Featured title">
      <div className="source-netflix-hero-image">
        <SmartImage src={active.backdrop ?? active.poster} alt="" sizes="100vw" priority />
      </div>
      <div className="source-netflix-hero-gradient" aria-hidden="true" />

      <div className="source-netflix-hero-content" key={active.id}>
        {active.kind === "series" && (
          <div className="source-netflix-original">
            <span className="source-netflix-original-n">N</span>
            <span>S E R I E S</span>
          </div>
        )}

        <h1>{active.title}</h1>

        {tags.length > 0 && (
          <div className="source-netflix-tags">
            {tags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && <i aria-hidden="true" />}
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="source-netflix-hero-buttons">
          <button type="button" className="source-netflix-play" onClick={() => openDetails(active)}>
            <IPlay /> Play
          </button>
          <button type="button" className="source-netflix-info" onClick={() => openDetails(active)}>
            <IInfo /> Info
          </button>
        </div>
      </div>

      {count > 1 && (
        <div className="source-netflix-dots" role="tablist" aria-label="Featured titles">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === index ? "on" : ""}
              onClick={() => go(i)}
              aria-label={"Show " + item.title}
              aria-selected={i === index}
              role="tab"
            />
          ))}
        </div>
      )}

      <span className="source-netflix-hidden-fav"><FavButton id={active.id} /></span>
    </section>
  );
}
