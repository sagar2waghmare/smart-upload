"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";
import { mergePatch, useLibraryEnrichment } from "./LibraryEnrichmentProvider";

const AUTO_DURATION = 7000;
/** Movement (px) that separates a tap from a drag (used to suppress the click). */
const TAP_SLOP = 10;
/** Movement (px) before horizontal intent is considered established. */
const INTENT_MIN = 12;
/** Horizontal movement (px) required to actually change slide. */
const SWIPE_MIN = 45;
/** Max poster follow distance while dragging (desktop / mobile). */
const DRAG_LIMIT = 140;
const MOBILE_DRAG_LIMIT = 55;
const AMBIENT_TONES = [
  "rgba(38, 30, 52, .58)",
  "rgba(24, 38, 54, .58)",
  "rgba(52, 30, 34, .56)",
  "rgba(30, 48, 42, .56)",
  "rgba(48, 40, 27, .54)",
];
const kindLabel = (k?: MediaItem["kind"]) => k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

type GestureState = {
  /** The hero section: the only element that reliably receives pointer events
      on desktop (the `.hero-track` box collapses to 0x0 there). */
  surface: HTMLElement;
  /** Carries `.is-dragging` so the existing desktop drag polish still applies. */
  track: HTMLElement | null;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  horizontal: boolean;
  dragging: boolean;
  suppressClick: boolean;
};

export function Hero({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  const { getPatch, request } = useLibraryEnrichment();
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Swipe state for ONE gesture at a time, owned by the artwork surface that
  // received the pointerdown (never by the whole hero).
  const gestureRef = useRef<GestureState | null>(null);

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
    if (!count) return;
    const current = mergePatch(items[index], getPatch(items[index].id));
    const next = count > 1 ? mergePatch(items[(index + 1) % count], getPatch(items[(index + 1) % count].id)) : undefined;
    const ids = [current, next]
      .filter((item): item is MediaItem => Boolean(item))
      .filter((item) => !item.poster || !item.tmdbId)
      .map((item) => item.id);
    if (ids.length) request(ids);
  }, [count, index, items, request, getPatch]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // --- Gesture surface --------------------------------------------------------
  // Handlers live on the hero section (`.hero-track` collapses to a 0x0 box on
  // desktop, so it cannot be the listener), but the gesture is scoped by
  // hit-testing: editorial copy, dots, the nav strip and every control are
  // rejected, so only artwork/background starts a swipe. Nothing is ever
  // preventDefault()-ed and the pointer is never captured on touch-down, so
  // Android keeps native vertical scrolling until horizontal intent is proven.
  const onSurfaceDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // One gesture at a time: a second finger must not restart the first drag.
    if (gestureRef.current?.dragging) return;
    const target = e.target as Element | null;
    const surface = e.currentTarget;
    const poster = target?.closest(".hero-poster, .mobile-hero-poster");
    const control = target?.closest('button, a, input, select, textarea, [role="button"]');
    // Controls are never swipe targets; the poster is the only interactive
    // element allowed to start (and then usually just tap through).
    if (control && !poster) return;
    // Editorial copy, carousel dots and the nav strip are never gesture surfaces.
    if (target?.closest(".hero-editorial, .mobile-hero-copy, .hero-dots, .hero-nav")) return;

    gestureRef.current = {
      surface,
      track: surface.querySelector<HTMLElement>(".hero-track"),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      horizontal: false,
      dragging: true,
      suppressClick: false,
    };
    // No pointer capture here: Android must stay free to scroll vertically
    // until horizontal intent is proven.
    surface.classList.add("is-pressing");
  }, []);

  const onSurfaceMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g?.dragging || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) g.moved = true;

    if (!g.horizontal) {
      if (Math.abs(dx) < INTENT_MIN && Math.abs(dy) < INTENT_MIN) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        // Vertical-dominant: abandon the carousel gesture entirely so the
        // browser keeps the page scroll (no capture, no slide change).
        g.dragging = false;
        g.surface.classList.remove("is-pressing");
        try { g.surface.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
        return;
      }
      g.horizontal = true;
      // Capture only after horizontal intent is established — never on
      // touch-down — so a vertical scroll is never hijacked.
      try { g.surface.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      g.surface.classList.add("is-dragging");
      g.track?.classList.add("is-dragging");
    }

    // Both drag variables are published on the section so desktop posters
    // (`--drag-x`) and the mobile poster (`--hero-drag-x`) both follow, each
    // with its own clamp.
    g.surface.style.setProperty("--drag-x", `${Math.max(-DRAG_LIMIT, Math.min(DRAG_LIMIT, dx))}px`);
    g.surface.style.setProperty("--hero-drag-x", `${Math.max(-MOBILE_DRAG_LIMIT, Math.min(MOBILE_DRAG_LIMIT, dx))}px`);
  }, []);

  const finishGesture = useCallback((e: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const g = gestureRef.current;
    // Ignore a pointer that is not the one we are tracking (e.g. a second
    // finger tapping an arrow while a drag is running) and never commit twice.
    if (!g || e.pointerId !== g.pointerId || !g.dragging) return;
    g.dragging = false;
    try {
      if (g.surface.hasPointerCapture(e.pointerId)) g.surface.releasePointerCapture(e.pointerId);
    } catch { /* nothing captured */ }
    g.surface.classList.remove("is-pressing", "is-dragging");
    g.track?.classList.remove("is-dragging");
    g.surface.style.setProperty("--drag-x", "0px");
    g.surface.style.setProperty("--hero-drag-x", "0px");

    const dx = e.clientX - g.startX;
    const navigated = commit && g.horizontal && Math.abs(dx) > SWIPE_MIN;
    if (navigated) go(dx < 0 ? index + 1 : index - 1);
    // Anything that moved past the tap slop was a drag, not a tap: the poster
    // click that follows must never open details after a swipe.
    if (g.moved || navigated) g.suppressClick = true;
    g.horizontal = false;
    g.moved = false;
  }, [go, index]);

  const onSurfaceUp = useCallback((e: React.PointerEvent<HTMLElement>) => finishGesture(e, true), [finishGesture]);
  // pointercancel = the browser took the gesture (usually a page scroll):
  // clean up but never change slide.
  const onSurfaceCancel = useCallback((e: React.PointerEvent<HTMLElement>) => finishGesture(e, false), [finishGesture]);

  const openFromPoster = useCallback((item: MediaItem) => {
    if (gestureRef.current?.suppressClick) {
      gestureRef.current.suppressClick = false;
      return;
    }
    openDetails(item);
  }, [openDetails]);

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
  const active = mergePatch(items[index], getPatch(items[index].id));
  const ambientTone = AMBIENT_TONES[index % AMBIENT_TONES.length];

  return (
    <section
      className="hero-filmes"
      aria-roledescription="carousel"
      aria-label="Featured titles"
      onPointerDown={onSurfaceDown}
      onPointerMove={onSurfaceMove}
      onPointerUp={onSurfaceUp}
      onPointerCancel={onSurfaceCancel}
    >
      <div className="hero-ambient" aria-hidden="true" style={{ backgroundColor: ambientTone }}><SmartImage src={active.backdrop ?? active.poster} alt="" sizes="100vw" priority /></div>
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-desktop-content">
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

      <div className="hero-track">
        {items.map((rawItem, i) => {
          const item = mergePatch(rawItem, getPatch(rawItem.id));
          let posicao = i - index;
          if (posicao > count / 2) posicao -= count;
          if (posicao < -count / 2) posicao += count;
          const distancia = Math.abs(posicao);
          const ativo = posicao === 0;
          return (
            <div
              key={item.id}
              className={`hero-poster ${ativo ? "ativo" : ""}`}
              style={{ "--posicao": posicao, "--distancia": distancia } as React.CSSProperties}
              role="button"
              aria-label={`Open ${item.title} details`}
              aria-hidden={!ativo}
              tabIndex={ativo ? 0 : -1}
              onClick={() => openFromPoster(item)}
              onKeyDown={(e) => {
                if (!ativo || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                openDetails(item);
              }}
            >
              {(ativo || distancia === 1) ? (
                <SmartImage
                  src={item.poster}
                  alt={`${item.title} poster`}
                  sizes="(max-width: 600px) 180px, 235px"
                  priority={false}
                />
              ) : null}
              <span className="hero-poster-sheen" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      </div>

      <div className="hero-mobile-content">
        <div className="mobile-hero-art">
          <div
            className="mobile-hero-poster"
            role="button"
            tabIndex={0}
            aria-label={`Open ${active.title} details`}
            onClick={() => openFromPoster(active)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              openDetails(active);
            }}
          >
            <SmartImage src={active.poster} alt={`${active.title} poster`} sizes="180px" priority />
          </div>

          <div className="mobile-hero-nav">
            <button type="button" className="mobile-hero-arrow" onClick={() => go(index - 1)} aria-label="Previous featured title"><IArrowLeft /></button>
            <button type="button" className="mobile-hero-arrow" onClick={() => go(index + 1)} aria-label="Next featured title"><IArrowRight /></button>
          </div>
        </div>

        <div className="mobile-hero-copy">
          <span className="mobile-hero-kicker">{kindLabel(active.kind)}</span>
          <h1>{active.title}</h1>
          <div className="mobile-hero-meta">
            {active.rating ? <span>★ {active.rating.toFixed(1)}</span> : null}
            {active.year ? <span>{active.year}</span> : null}
            {active.runtime ? <span>{Math.floor(active.runtime / 60)}h {active.runtime % 60}m</span> : null}
          </div>
          <div className="mobile-hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => openDetails(active)}><IPlay /> Play</button>
            <FavButton id={active.id} labelStyle="chip" />
            <button type="button" className="btn btn-secondary" onClick={() => openDetails(active)}><IInfo /> Details</button>
          </div>
          {active.overview ? <p>{active.overview}</p> : null}
        </div>

        <div className="mobile-hero-dots" role="tablist" aria-label="Featured titles">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`mobile-hero-dot ${i === index ? "on" : ""}`}
              onClick={() => go(i)}
              aria-label={`Show ${item.title}`}
              aria-selected={i === index}
              role="tab"
            />
          ))}
        </div>
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
