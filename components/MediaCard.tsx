"use client";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { formatPosition, progressPercent, useWatchProgress, watchMode } from "../lib/watch-progress";

export function MediaCard({ item }: { item: MediaItem }) {
  const { openDetails } = useDetails();
  const progress = useWatchProgress()[item.id] ?? null;
  const pct = progress ? progressPercent(progress) : 0;
  const mode = watchMode(progress);
  const showBar = Boolean(progress && progress.duration > 0 && pct > 0.5 && pct < 97);

  const kindLabel =
    item.kind === "series"
      ? `TV Series`
      : item.kind === "anime"
        ? "Anime"
        : "Filme";
  const meta = item.year ? `${item.year} · ${kindLabel}` : kindLabel;

  const open = () => openDetails(item);

  return (
    <article className="card-conteudo">
      <button className="poster" onClick={open} aria-label={`Open details for ${item.title}`}>
        <SmartImage src={item.poster} alt={`${item.title} poster`} objectFit="contain" />
      </button>
      <FavButton id={item.id} />
      <div className="info-conteudo">
        <h3>{item.title}</h3>
        <span>{meta}</span>
        {item.rating && <strong>{item.rating.toFixed(1)} ★</strong>}
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
