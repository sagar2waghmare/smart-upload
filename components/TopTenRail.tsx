"use client";

import type { MediaItem } from "../lib/types";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";

export function TopTenRail({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  if (!items.length) return null;

  return (
    <section className="secao-conteudos nf-rail nf-top10-rail" aria-label="Top 10">
      <div className="titulo-secao nf-rail-title">
        <h2><span className="nf-top10-badge">TOP</span> 10 in your library</h2>
        <span className="nf-rail-kicker">Updated from your library</span>
      </div>

      <div className="nf-top10-list">
        {items.slice(0, 10).map((item, index) => (
          <button
            key={item.id}
            type="button"
            className="nf-top10-card"
            onClick={() => openDetails(item)}
            aria-label={`Open ${item.title}, rank ${index + 1}`}
          >
            <span className="nf-top10-number" aria-hidden="true">{index + 1}</span>
            <span className="nf-top10-poster">
              <SmartImage src={item.poster} alt={`${item.title} poster`} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
