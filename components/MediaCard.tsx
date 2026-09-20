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
    item.kind === "series" ? "TV Series" :
    item.kind === "anime" ? "Anime" : "Movie";

  return (
    <article className="card-conteudo nf-card">
      <button className="poster nf-poster" onClick={() => openDetails(item)} aria-label={`Open details for ${item.title}`}>
        <SmartImage src={item.poster} alt={`${item.title} poster`} />
        <span className="nf-card-gradient" aria-hidden="true" />
        <span className="nf-card-copy" aria-hidden="true">
          <strong>{item.title}</strong>
          <small>{item.year ?? "—"} · {kindLabel}</small>
        </span>
        {showBar && progress && (
          <span className="nf-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
        )}
      </button>
      <FavButton id={item.id} />
      {showBar && progress && (
        <span className="nf-resume-label">{mode === "resume" ? `Resume at ${formatPosition(progress.position)}` : "Continue watching"}</span>
      )}
    </article>
  );
}
