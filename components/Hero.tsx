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
  const dragRef = useRef({ startX: 0, startY: 0, dragging: false, moved: false, horizontal: false });
  const heroRef = useRef<HTMLElement>(null);
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
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: true, moved: false, horizontal: false };
    // The entire hero is a swipe surface: poster, title, metadata and action
    // buttons. We wait for the direction before taking control of the gesture.
    heroRef.current?.classList.add("is-pressing");
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging || !trackRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.horizontal && Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (!dragRef.current.horizontal) {
      dragRef.current.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!dragRef.current.horizontal) {
        dragRef.current.dragging = false;
        trackRef.current?.classList.remove("is-pressing");
        return;
      }
      try { heroRef.current?.setPointerCapture(e.pointerId); } catch {}
      heroRef.current?.classList.add("is-dragging");
    }
    if (Math.abs(dx) > 8) dragRef.current.moved = true;
    trackRef.current.style.setProperty("--drag-x", `${Math.max(-140, Math.min(140, dx))}px`);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    try { trackRef.current?.releasePointerCapture(e.pointerId); } catch {}
    try { heroRef.current?.releasePointerCapture(e.pointerId); } catch {}
    heroRef.current?.classList.remove("is-pressing", "is-dragging");
    trackRef.current?.style.setProperty("--drag-x", "0px");
    const dx = e.clientX - dragRef.current.startX;
    if (dragRef.current.horizontal && Math.abs(dx) > 45) go(dx < 0 ? index + 1 : index - 1);
  }, [index, go]);


  // Keyboard/remote navigation: desktop and TV can move the hero without clicking arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  if (!count) return null;
  const active = items[index];
  const ambientTone = AMBIENT_TONES[index % AMBIENT_TONES.length];

  return (
    <section ref={heroRef} className="hero-filmes" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-roledescription="carousel" aria-label="Featured titles">
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

      <div ref={trackRef} className="hero-track">
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
