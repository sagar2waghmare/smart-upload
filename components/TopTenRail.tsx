"use client";

import type { MediaItem } from "../lib/types";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";

export function TopTenRail({ title, items }: { title: string; items: MediaItem[] }) {
  const { openDetails } = useDetails();
  if (!items.length) return null;

  return (
    <section className="source-netflix-row source-netflix-top10" aria-label="Top 10">
      <div className="source-netflix-row-title">
        <div className="source-netflix-top10-heading">
          <span className="source-netflix-top10-badge"><b>TOP</b><b>10</b></span>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="source-netflix-top10-list">
        {items.slice(0, 10).map((item, index) => (
          <button
            type="button"
            className="source-netflix-top10-card"
            key={item.id}
            onClick={() => openDetails(item)}
            aria-label={"Open " + item.title + ", rank " + (index + 1)}
          >
            <span className="source-netflix-top10-number" aria-hidden="true">{index + 1}</span>
            <span className="source-netflix-top10-poster">
              <SmartImage src={item.poster} alt={item.title + " poster"} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
