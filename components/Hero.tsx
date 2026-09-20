"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";

const AUTO_DURATION = 7000;

const kindLabel = (k?: MediaItem["kind"]) =>
  k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

export function Hero({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const dragRef = useRef({ startX: 0, dragging: false, moved: false });
  const trackRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: number) => {
    if (!count) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  const advance = useCallback(() => {
    if (count > 1) setIndex((prev) => (prev + 1) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(advance, AUTO_DURATION);
    return () => window.clearInterval(id);
  }, [count, hidden, advance]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { startX: e.clientX, dragging: true, moved: false };
    trackRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 8) dragRef.current.moved = true;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    trackRef.current?.releasePointerCapture?.(e.pointerId);
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
  }, [index, go]);

  if (!count) return null;

  const active = items[index];

  return (
    <section className="hero-filmes nf-hero" aria-roledescription="carousel" aria-label="Featured titles">
      <div className="nf-hero-backdrop">
        <SmartImage
          src={active.backdrop ?? active.poster}
          alt=""
          sizes="100vw"
          priority
        />
      </div>
      <div className="nf-hero-vignette" aria-hidden="true" />

      <div className="hero-editorial nf-hero-content" key={active.id}>
        <span className="nf-hero-kicker">{kindLabel(active.kind)}</span>
        <h1>{active.title}</h1>
        <div className="hero-editorial-meta nf-hero-meta">
          {active.rating ? <span>★ {active.rating.toFixed(1)}</span> : null}
          {active.year ? <span>{active.year}</span> : null}
          {active.runtime ? <span>{Math.floor(active.runtime / 60)}h {active.runtime % 60}m</span> : null}
        </div>
        {active.overview ? <p className="hero-editorial-overview">{active.overview}</p> : null}

        <div className="hero-editorial-actions nf-hero-actions">
          <button type="button" className="btn btn-primary nf-play-btn" onClick={() => openDetails(active)}>
            <IPlay /> Play
          </button>
          <FavButton id={active.id} labelStyle="chip" />
          <button type="button" className="btn btn-secondary nf-info-btn" onClick={() => openDetails(active)}>
            <IInfo /> Details
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="hero-track nf-hero-track-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      />

      <div className="hero-nav nf-hero-nav-hidden" aria-hidden="true">
        <button className="hero-nav-btn" onClick={() => go(index - 1)} aria-label="Previous featured title">
          <IArrowLeft />
        </button>
        <button className="hero-nav-btn" onClick={() => go(index + 1)} aria-label="Next featured title">
          <IArrowRight />
        </button>
      </div>

      {count > 1 && (
        <div className="hero-dots nf-hero-dots" role="tablist" aria-label="Featured titles">
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`hero-dot ${i === index ? "on" : ""}`}
              onClick={() => go(i)}
              aria-label={`Show ${item.title}`}
              aria-selected={i === index}
              role="tab"
            />
          ))}
        </div>
      )}
    </section>
  );
}
