"use client";
import { useCallback } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { formatPosition, progressPercent, useWatchProgress, watchMode } from "../lib/watch-progress";
import { mergePatch, useLibraryEnrichment } from "./LibraryEnrichmentProvider";
import { ICheck, IClock, IPlay, IReplay } from "./icons";

export function MediaCard({ item, priority = false }: { item: MediaItem; priority?: boolean }) {
  const { openDetails } = useDetails();
  const { getPatch, observe } = useLibraryEnrichment();
  const displayItem = mergePatch(item, getPatch(item.id));
  const progress = useWatchProgress()[item.id] ?? null;
  const pct = progress ? progressPercent(progress) : 0;
  const mode = watchMode(progress);
  const showBar = Boolean(progress && progress.duration > 0 && pct > 0.5 && pct < 97);
  const recentlyAdded = displayItem.tag?.toLowerCase().includes("recently added") ?? false;
  const completed = mode === "replay";
  const resumeEpisode = progress?.episodeId
    ? displayItem.seasons
        ?.flatMap((season) => season.episodes)
        .find((episode) => episode.id === progress.episodeId)
    : null;

  const kindLabel =
    displayItem.kind === "series"
      ? "TV Series"
      : displayItem.kind === "anime"
        ? "Anime"
        : "Movie";
  const meta = displayItem.year ? displayItem.year + " · " + kindLabel : kindLabel;

  const statusLabel = completed ? "Watched" : mode === "resume" ? "Resume" : recentlyAdded ? "New" : null;
  const statusIcon = completed ? <ICheck /> : mode === "resume" ? <IPlay /> : recentlyAdded ? <IClock /> : null;

  const needsEnrichment = !displayItem.poster || !displayItem.tmdbId;
  const setCardRef = useCallback(
    (node: HTMLElement | null) => observe(item.id, needsEnrichment ? node : null),
    [item.id, needsEnrichment, observe],
  );

  return (
    <article
      ref={setCardRef}
      className={"card-conteudo" + (mode === "resume" ? " is-resume" : "") + (completed ? " is-complete" : "")}
    >
      <button
        className="poster"
        onClick={() => openDetails(displayItem)}
        aria-label={"Open details for " + displayItem.title}
      >
        <SmartImage
          src={displayItem.poster}
          alt={displayItem.title + " poster"}
          objectFit="contain"
          priority={priority}
        />
        <span className="poster-sheen" aria-hidden="true" />
        {statusLabel ? (
          <span className={"media-card-status status-" + (completed ? "watched" : mode === "resume" ? "resume" : "new")}>
            {statusIcon}
            {statusLabel}
          </span>
        ) : null}
        {displayItem.rating ? (
          <span className="media-card-rating" aria-label={"Rating " + displayItem.rating.toFixed(1) + " out of 10"}>
            {displayItem.rating.toFixed(1)} ★
          </span>
        ) : null}
        {mode === "resume" && resumeEpisode ? (
          <span className="media-card-episode">
            S{String(resumeEpisode.season).padStart(2, "0")} · E{String(resumeEpisode.episode).padStart(2, "0")}
          </span>
        ) : null}
      </button>

      <FavButton id={item.id} />

      <div className="info-conteudo">
        <h3>{displayItem.title}</h3>
        <span>{meta}</span>

        {showBar && progress ? (
          <div className="media-card-progress">
            <span className="media-card-progress-label">
              Resume at {formatPosition(progress.position)}
            </span>
            <div
              className="progress-bar media-card-progress-bar"
              role="progressbar"
              aria-label={"Watched " + Math.round(pct) + " percent"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <span style={{ width: Math.min(100, pct) + "%" }} />
            </div>
          </div>
        ) : completed ? (
          <span className="media-card-complete">
            <IReplay /> Watch again
          </span>
        ) : null}
      </div>
    </article>
  );
}