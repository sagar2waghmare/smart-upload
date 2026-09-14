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
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
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
    dragRef.current = { startX: e.clientX, dragging: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  if (count === 0) return null;

  const active = items[index];

  return (
    <section
      className="hero-filmes"
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
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
              style={
                {
                  "--posicao": posicao,
                  "--distancia": distancia,
                  top: "40%",
                } as React.CSSProperties
              }
              aria-hidden={!ativo}
            >
              <SmartImage
                src={item.backdrop ?? item.poster}
                alt=""
                sizes="320px"
                priority={ativo}
              />
              {ativo && active && (
                <div className="hero-info">
                  <span>{kindLabel(active.kind)}</span>
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

      <div className="hero-nav">
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

      <div className="hero-dots">
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

      <style jsx>{`
        .hero-poster {
          top: 40% !important;
          transform: translate(calc(-50% + (var(--posicao) * 240px)), -50%)
            scale(calc(1 - (var(--distancia) * 0.12)))
            rotateY(calc(var(--posicao) * -2deg));
          transform-origin: center center;
          transition:
            transform 700ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity 500ms ease,
            filter 500ms ease;
          will-change: transform, opacity, filter;
        }
        .hero-poster img {
          transition:
            transform 500ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 500ms ease,
            filter 500ms ease;
        }
        .hero-poster:hover img {
          transform: scale(1.035) translateY(-3px);
          filter: saturate(1.06) brightness(1.04);
          box-shadow: 0 42px 95px rgba(0, 0, 0, 0.96);
        }
        .hero-poster.ativo:hover img {
          transform: scale(1.018) translateY(-2px);
        }
        .hero-poster::after {
          content: "";
          position: absolute;
          left: 12%;
          right: 12%;
          bottom: -28px;
          height: 46px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(124, 58, 237, 0.34), transparent 68%);
          filter: blur(14px);
          opacity: 0.55;
          pointer-events: none;
          transform: scaleX(0.86);
          transition: opacity 500ms ease, transform 700ms ease;
        }
        .hero-poster.ativo::after {
          opacity: 0.9;
          transform: scaleX(1);
        }
        .hero-info {
          z-index: 22;
          pointer-events: none;
        }
        .hero-info .hero-actions,
        .hero-info .hero-actions button {
          pointer-events: auto;
        }
        @media (max-width: 768px) {
          .hero-poster {
            top: 40% !important;
            transform: translate(calc(-50% + (var(--posicao) * 170px)), -50%)
              scale(calc(1 - (var(--distancia) * 0.12)))
              rotateY(calc(var(--posicao) * -1.5deg));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-poster,
          .hero-poster img,
          .hero-poster::after {
            transition: none !important;
          }
        }
      `}</style>
    </section>
  );
}
