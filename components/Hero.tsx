"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, dragging: true };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 50) {
        go(dx < 0 ? index + 1 : index - 1);
      }
    },
    [index, go],
  );

  if (count === 0) return null;

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
            <div
              key={item.id}
              className={`hero-poster ${ativo ? "ativo" : ""}`}
              style={
                {
                  "--posicao": posicao,
                  "--distancia": distancia,
                } as React.CSSProperties
              }
              aria-hidden={!ativo}
            >
              <SmartImage
                src={item.backdrop ?? item.poster}
                alt=""
                sizes="350px"
                priority={ativo}
              />
            </div>
          );
        })}
      </div>

      <div className="hero-info">
        {(() => {
          const active = items[index];
          if (!active) return null;
          return (
            <>
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
                <Link href={`/play/${active.id}`} className="btn btn-primary">
                  <IPlay /> Play
                </Link>
                <FavButton id={active.id} labelStyle="chip" />
                <button
                  className="btn btn-secondary"
                  onClick={() => openDetails(active)}
                  aria-label="View details and episodes"
                >
                  <IInfo /> Details
                </button>
              </div>
            </>
          );
        })()}
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
    </section>
  );
}
