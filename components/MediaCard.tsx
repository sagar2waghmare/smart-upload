"use client";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { formatPosition, progressPercent, useWatchProgress, watchMode } from "../lib/watch-progress";

export function MediaCard({ item, landscape = false }: { item: MediaItem; landscape?: boolean }) {
  const { openDetails } = useDetails();
  const progress = useWatchProgress()[item.id] ?? null;
  const pct = progress ? progressPercent(progress) : 0;
  const mode = watchMode(progress);
  const showBar = Boolean(progress && progress.duration > 0 && pct > 0.5 && pct < 97);

  const kindLabel =
    item.kind === "series"
      ? `S${(item.seasons?.[0]?.season ?? 1).toString().padStart(2, "0")}`
      : item.kind === "anime"
        ? "Anime"
        : "Movie";
  const meta = item.year ? `${item.year} • ${kindLabel}` : kindLabel;
  const tagStyle = item.tagStyle ? `tag-${item.tagStyle}` : "";

  const open = () => openDetails(item);

  return (
    <article className={`media-card ${landscape ? "landscape" : ""}`}>
      <div className="art">
        <button className="art-open" onClick={open} aria-label={`Open details for ${item.title}`}>
          <SmartImage src={item.poster} alt={`${item.title} poster`} />
        </button>
        <div className="shine" aria-hidden />
        {(item.tag || item.kind === "anime") && (
          <div className="card-tags" aria-hidden>
            {item.tag && <span className={`tag ${tagStyle}`}>{item.tag}</span>}
            {item.kind === "anime" && <span className="tag">ANIME</span>}
          </div>
        )}
        <div className="card-overlay">
          <FavButton id={item.id} />
        </div>
      </div>
      <div className="card-info">
        <button className="card-title" onClick={open} aria-label={item.title}>
          {item.title}
        </button>
        <div className="card-meta">{meta}</div>
        {showBar && progress && (
          <div className="card-progress">
            {mode === "resume" && (
              <span className="card-progress-label">Resume at {formatPosition(progress.position)}</span>
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