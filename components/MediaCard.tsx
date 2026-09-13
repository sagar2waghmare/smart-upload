"use client";
import Link from "next/link";
import type { MediaItem } from "../lib/types";
import { IPlay } from "./icons";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";

export function MediaCard({ item, landscape = false }: { item: MediaItem; landscape?: boolean }) {
  const kindLabel =
    item.kind === "series"
      ? `S${(item.seasons?.[0]?.season ?? 1).toString().padStart(2, "0")}`
      : item.kind === "anime"
        ? "Anime"
        : "Movie";
  const meta = item.year ? `${item.year} • ${kindLabel}` : kindLabel;
  const tagStyle = item.tagStyle ? `tag-${item.tagStyle}` : "";

  return (
    <article className={`media-card ${landscape ? "landscape" : ""}`}>
      <div className="art">
        <SmartImage src={item.poster} alt={`${item.title} poster`} />
        <div className="shine" />
        {(item.tag || item.progress !== undefined) && (
          <div className="card-tags">
            {item.tag && <span className={`tag ${tagStyle}`}>{item.tag}</span>}
            {item.kind === "anime" && <span className="tag">ANIME</span>}
          </div>
        )}
        <div className="card-overlay">
          <FavButton id={item.id} />
          <Link
            href={`/play/${item.id}`}
            className="card-play"
            aria-label={`Play ${item.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <IPlay />
          </Link>
        </div>
      </div>
      <div className="card-info">
        <Link href={`/play/${item.id}`} className="card-title" aria-label={item.title}>
          {item.title}
        </Link>
        <div className="card-meta">{meta}</div>
        {item.progress !== undefined && (
          <div className="progress-bar" aria-label={`${item.progress}% watched`}>
            <span style={{ width: `${Math.min(100, item.progress)}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}