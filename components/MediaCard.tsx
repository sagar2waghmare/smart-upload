"use client";

import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { progressPercent, useWatchProgress } from "../lib/watch-progress";

export function MediaCard({ item }: { item: MediaItem }) {
  const { openDetails } = useDetails();
  const progress = useWatchProgress()[item.id] ?? null;
  const pct = progress ? progressPercent(progress) : 0;
  const showBar = Boolean(progress && progress.duration > 0 && pct > 0.5 && pct < 97);

  return (
    <article className="source-netflix-poster-card">
      <button
        type="button"
        className="source-netflix-poster-button"
        onClick={() => openDetails(item)}
        aria-label={"Open " + item.title}
      >
        <SmartImage src={item.poster} alt={item.title + " poster"} />
        {item.kind === "series" && (
          <span className="source-netflix-new-badge">NEW EPISODE</span>
        )}
        {showBar && (
          <span className="source-netflix-progress">
            <span style={{ width: Math.min(100, pct) + "%" }} />
          </span>
        )}
      </button>
      <span className="source-netflix-card-fav"><FavButton id={item.id} /></span>
    </article>
  );
}
