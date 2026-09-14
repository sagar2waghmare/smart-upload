"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";

const AUTO_DURATION = 8500;

const kindLabel = (k?: MediaItem["kind"]) =>
  k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

export function Hero({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const dragRef = useRef({ startX: 0, dragging: false });

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  const advance = useCallback(() => {
    setIndex((prev) => (prev + 1) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || hidden) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
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

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
    },
    [index, go],
  );

  if (!count) return null;

  const active = items[index];

  return (
    <section
      className="hero-filmes"
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <div className="hero-ambient" aria-hidden="true">
        <SmartImage src={active.backdrop ?? active.poster} alt="" sizes="100vw" priority />
      </div>
      <div className="hero-vignette" aria-hidden="true" />

      <div
        className="hero-track"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {items.map((item, i) => {
          let posicao = i - index;
          if (posicao > count / 2) posicao -= count;
          if (posicao < -count / 2) posicao += count;
          const distancia = Math.abs(posicao);
          const ativo = posicao === 0;

          return (
            <article
              key={item.id}
              className={`hero-poster ${ativo ? "ativo" : ""}`}
              style={{
                "--posicao": posicao,
                "--distancia": distancia,
              } as React.CSSProperties}
              aria-hidden={!ativo}
            >
              <SmartImage
                src={item.poster}
                alt={`${item.title} poster`}
                sizes="(max-width: 600px) 190px, (max-width: 900px) 225px, 270px"
                priority={ativo}
              />
              <div className="hero-poster-sheen" aria-hidden="true" />
              {ativo && (
                <div className="hero-info">
                  <span className="hero-kind">{kindLabel(active.kind)}</span>
                  <h1>{active.title}</h1>
                  <p className="hero-star">
                    {active.rating ? `${active.rating.toFixed(1)} / 10` : ""}
                    {active.year ? ` · ${active.year}` : ""}
                    {active.runtime
                      ? ` · ${Math.floor(active.runtime / 60)}h ${active.runtime % 60}m`
                      : ""}
                  </p>
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openDetails(active)}
                      aria-label={`Open ${active.title} details before playback`}
                    >
                      <IPlay /> Play
                    </button>
                    <FavButton id={active.id} labelStyle="chip" />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openDetails(active)}
                      aria-label="View details and episodes"
                    >
                      <IInfo /> Details
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="hero-nav" aria-label="Featured navigation">
        <button
          className="hero-nav-btn"
          onClick={() => go(index - 1)}
          aria-label="Previous featured title"
        >
          <IArrowLeft />
        </button>
        <button
          className="hero-nav-btn"
          onClick={() => go(index + 1)}
          aria-label="Next featured title"
        >
          <IArrowRight />
        </button>
      </div>

      <div className="hero-dots" role="tablist" aria-label="Featured titles">
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
    </section>
  );
}
