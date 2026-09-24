"use client";
import { useCallback } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { formatPosition, progressPercent, useWatchProgress, watchMode } from "../lib/watch-progress";
import { mergePatch, useLibraryEnrichment } from "./LibraryEnrichmentProvider";

export function MediaCard({ item, priority = false }: { item: MediaItem; priority?: boolean }) {
  const { openDetails } = useDetails();
  const { getPatch, observe } = useLibraryEnrichment();
  const displayItem = mergePatch(item, getPatch(item.id));
  const progress = useWatchProgress()[item.id] ?? null;
  const pct = progress ? progressPercent(progress) : 0;
  const mode = watchMode(progress);
  const showBar = Boolean(progress && progress.duration > 0 && pct > 0.5 && pct < 97);

  const kindLabel =
    displayItem.kind === "series"
      ? "TV Series"
      : displayItem.kind === "anime"
        ? "Anime"
        : "Filme";
  const meta = displayItem.year ? `${displayItem.year} · ${kindLabel}` : kindLabel;

  const setCardRef = useCallback(
    (node: HTMLElement | null) => observe(item.id, node),
    [item.id, observe],
  );

  return (
    <article
      ref={setCardRef}
      className="card-conteudo"
    >
      <button className="poster" onClick={() => openDetails(displayItem)} aria-label={`Open details for ${displayItem.title}`}>
        <SmartImage src={displayItem.poster} alt={`${displayItem.title} poster`} objectFit="contain" priority={priority} />
      </button>
      <FavButton id={item.id} />
      <div className="info-conteudo">
        <h3>{displayItem.title}</h3>
        <span>{meta}</span>
        {displayItem.rating && <strong>{displayItem.rating.toFixed(1)} ★</strong>}
        {showBar && progress && (
          <div className="media-card-progress">
            {mode === "resume" && (
              <span className="media-card-progress-label">Resume at {formatPosition(progress.position)}</span>
            )}
            <div className="progress-bar" aria-hidden>
              <span style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
