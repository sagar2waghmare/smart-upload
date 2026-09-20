"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";

const AUTO_DURATION = 7000;
const AMBIENT_TONES = [
  "rgba(38, 30, 52, .58)",
  "rgba(24, 38, 54, .58)",
  "rgba(52, 30, 34, .56)",
  "rgba(30, 48, 42, .56)",
  "rgba(48, 40, 27, .54)",
];
const kindLabel = (k?: MediaItem["kind"]) => k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

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
  const advance = useCallback(() => setIndex((prev) => (prev + 1) % count), [count]);

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
    dragRef.current = { startX: e.clientX, dragging: true };
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
  }, [index, go]);

  if (!count) return null;
  const active = items[index];
  const ambientTone = AMBIENT_TONES[index % AMBIENT_TONES.length];

  return (
    <section className="hero-filmes" aria-roledescription="carousel" aria-label="Featured titles">
      <div className="hero-ambient" aria-hidden="true" style={{ backgroundColor: ambientTone }}><SmartImage src={active.backdrop ?? active.poster} alt="" sizes="100vw" priority /></div>
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-editorial" key={active.id}>
        <span className="hero-editorial-kicker">{kindLabel(active.kind)}</span>
        <h1>{active.title}</h1>
        <div className="hero-editorial-meta">
          {active.rating ? <span>★ {active.rating.toFixed(1)}</span> : null}
          {active.year ? <span>{active.year}</span> : null}
          {active.runtime ? <span>{Math.floor(active.runtime / 60)}h {active.runtime % 60}m</span> : null}
        </div>
        {active.overview ? <p className="hero-editorial-overview">{active.overview}</p> : null}
        <div className="hero-editorial-actions">
          <button type="button" className="btn btn-primary" onClick={() => openDetails(active)}><IPlay /> Play</button>
          <FavButton id={active.id} labelStyle="chip" />
          <button type="button" className="btn btn-secondary" onClick={() => openDetails(active)}><IInfo /> Details</button>
        </div>
      </div>

      <div ref={trackRef} className="hero-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {items.map((item, i) => {
          let posicao = i - index;
          if (posicao > count / 2) posicao -= count;
          if (posicao < -count / 2) posicao += count;
          const distancia = Math.abs(posicao);
          const ativo = posicao === 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`hero-poster ${ativo ? "ativo" : ""}`}
              style={{ "--posicao": posicao, "--distancia": distancia } as React.CSSProperties}
              aria-label={`Open ${item.title} details`}
              aria-hidden={!ativo}
              tabIndex={ativo ? 0 : -1}
              onClick={(e) => { if (dragRef.current.moved) { e.preventDefault(); dragRef.current.moved = false; return; } openDetails(item); }}
            >
              <SmartImage src={item.poster} alt={`${item.title} poster`} sizes="(max-width: 600px) 180px, 235px" priority={ativo} />
              <span className="hero-poster-sheen" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="hero-nav" aria-label="Featured navigation">
        <button className="hero-nav-btn" onClick={() => go(index - 1)} aria-label="Previous featured title"><IArrowLeft /></button>
        <button className="hero-nav-btn" onClick={() => go(index + 1)} aria-label="Next featured title"><IArrowRight /></button>
      </div>
      <div className="hero-dots" role="tablist" aria-label="Featured titles">
        {items.map((item, i) => <button key={item.id} className={`hero-dot ${i === index ? "on" : ""}`} onClick={() => go(i)} aria-label={`Show ${item.title}`} aria-selected={i === index} role="tab" />)}
      </div>
    </section>
  );
}
