"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";

const AUTO_DURATION = 8500;

const kindLabel = (k?: MediaItem["kind"]) =>
  k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

export function Hero({ items }: { items: MediaItem[] }) {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [hidden, setHidden] = useState(false);

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || interacting || hidden) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const t = setTimeout(() => setIndex((prev) => (prev + 1) % count), AUTO_DURATION);
    return () => clearTimeout(t);
  }, [count, index, interacting, hidden]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (count === 0) return null;

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured titles"
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={() => setInteracting(false)}
    >
      {items.map((item, i) => {
        const on = i === index;
        return (
          <div key={item.id} className={`hero-layer ${on ? "on" : ""}`} aria-hidden={!on}>
            <SmartImage
              className="hero-bg"
              src={item.backdrop ?? item.poster}
              alt=""
              sizes="100vw"
              priority={on}
            />
            <div className="hero-gradient" />
            <div key={on ? item.id : `${item.id}-off`} className="hero-content">
              <span className="eyebrow">{kindLabel(item.kind)}</span>
              <h1>{item.title}</h1>
              <p className="hero-meta">
                {item.year ?? "—"} <b className="dot">•</b>
                {item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : "Feature"}{" "}
                <b className="dot">•</b> {(item.genres ?? ["Drama"]).slice(0, 2).join(" · ")}
                {item.rating ? (
                  <>
                    <b className="dot">•</b> {item.rating.toFixed(1)} / 10
                  </>
                ) : null}
              </p>
              {item.overview && <p className="hero-copy">{item.overview}</p>}
              <div className="hero-actions">
                <Link href={`/play/${item.id}`} className="btn btn-primary">
                  <IPlay /> Play
                </Link>
                <FavButton id={item.id} labelStyle="chip" />
                <Link href={`/play/${item.id}`} className="btn btn-secondary" aria-label="View details and episodes">
                  <IInfo /> Details
                </Link>
              </div>
              <p className="hero-tagline">Media source: {item.mediaUrl ? "stream ready" : "demo preview stream"}</p>
            </div>
          </div>
        );
      })}

      <div className="hero-nav">
        <button className="hero-nav-btn" onClick={() => go(index - 1)} aria-label="Previous featured title">
          <IArrowLeft />
        </button>
        <button className="hero-nav-btn" onClick={() => go(index + 1)} aria-label="Next featured title">
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