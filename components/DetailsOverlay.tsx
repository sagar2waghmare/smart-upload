"use client";
import { useMemo, useState } from "react";
import type { Episode, MediaItem } from "../lib/types";
import { useDetails } from "./DetailsProvider";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { IArrowLeft, IChevronRight, IPlay } from "./icons";
import { useTmdbMeta } from "../lib/use-tmdb-metadata";
import { formatPosition, getProgress, progressPercent, useWatchProgress, watchMode } from "../lib/watch-progress";

const kindLabel = (k?: MediaItem["kind"]) =>
  k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FILME";

export function DetailsOverlay() {
  const { item, openPlayer, closeDetails } = useDetails();
  const progressMap = useWatchProgress();
  const tmdb = useTmdbMeta(item);

  const allEpisodes = useMemo(() => item?.seasons?.flatMap((s) => s.episodes) ?? [], [item]);
  const priorEpisode = useMemo(() => {
    if (!item) return null;
    const resumeId = getProgress(item.id)?.episodeId;
    if (!resumeId) return null;
    return allEpisodes.find((e) => e.id === resumeId) ?? allEpisodes[0] ?? null;
  }, [item, allEpisodes]);

  const [seasonIdx, setSeasonIdx] = useState(() => {
    if (!item || !priorEpisode) return 0;
    const idx = item.seasons?.findIndex((s) => s.episodes.some((e) => e.id === priorEpisode.id)) ?? -1;
    return idx >= 0 ? idx : 0;
  });
  const [episode, setEpisode] = useState<Episode | null>(priorEpisode);

  if (!item) return null;

  const progress = progressMap[item.id] ?? null;
  const mode = watchMode(progress);
  const playLabel = mode === "resume" ? "Resume Watching" : mode === "replay" ? "Watch Again" : "Play";
  const playEp = allEpisodes.length > 0 ? episode : null;

  const meta = tmdb.meta;
  const backdrop = meta?.backdrop || item.backdrop || item.poster;
  const overview = meta?.overview || item.overview || "";
  const genres = (meta?.genres && meta.genres.length ? meta.genres : item.genres) ?? [];
  const rating = meta?.rating ?? item.rating;
  const runtime = meta?.runtime ?? item.runtime;
  const year = meta?.year ?? item.year;

  const seasons = item.seasons ?? [];
  const currentSeason = seasons[seasonIdx] ?? seasons[0];
  const list = currentSeason?.episodes ?? [];

  return (
    <div className="details-overlay" role="dialog" aria-modal="true" aria-label={`${item.title} details`}>
      <button className="details-back" onClick={closeDetails} aria-label="Back">
        <IArrowLeft />
      </button>

      <div className="details-hero">
        <div className="details-hero-bg">
          <SmartImage src={backdrop} alt="" sizes="100vw" priority />
        </div>
        <div className="details-hero-shade" />

        <div className="details-copy">
          <div className="details-poster">
            <SmartImage src={item.poster} alt={`${item.title} poster`} sizes="320px" />
          </div>

          <div className="details-right">
            <span className="filme-tipo">{kindLabel(item.kind)}</span>
            <h1>{item.title}</h1>

            <div className="details-stats">
              {rating ? (
                <div className="nota-tmdb">
                  <span>TMDB</span>
                  <strong>{rating.toFixed(1)}</strong>
                </div>
              ) : null}
              {year ? (
                <div className="meta-item">
                  <span>Year</span>
                  <strong>{year}</strong>
                </div>
              ) : null}
              {runtime ? (
                <div className="meta-item">
                  <span>Duration</span>
                  <strong>{Math.floor(runtime / 60)}h {runtime % 60}m</strong>
                </div>
              ) : null}
            </div>

            {genres.length > 0 && (
              <div className="details-genres">
                {genres.slice(0, 4).map((g) => (
                  <span key={g} className="genero">{g}</span>
                ))}
              </div>
            )}

            {overview && <p className="details-overview">{overview}</p>}

            {playEp && (
              <span className="pill pill-primary" style={{ marginTop: ".7em" }}>
                S{String(playEp.season).padStart(2, "0")} · E{String(playEp.episode).padStart(2, "0")} — {playEp.title}
              </span>
            )}

            <div className="details-actions">
              <button className="btn btn-primary" onClick={() => openPlayer(playEp ?? undefined)} aria-label={playLabel}>
                <IPlay /> {playLabel}
              </button>
              <FavButton id={item.id} labelStyle="chip" />
            </div>

            {progress && progressPercent(progress) > 0.5 && (
              <div className="resume-row">
                <span className="pill pill-neutral resume-chip">
                  {mode === "replay" ? "Completed" : `Resume at ${formatPosition(progress.position)}`}
                </span>
                <div className="progress-bar resume-bar">
                  <span style={{ width: `${Math.min(100, progressPercent(progress))}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {allEpisodes.length > 0 && (
        <section className="details-section" aria-label="Episodes" style={{ maxWidth: 1250, margin: "0 auto", padding: "0 7vw" }}>
          <div className="season-head">
            <h2>Episodes</h2>
            {seasons.length > 1 && (
              <select
                className="season-select"
                aria-label="Season"
                value={seasonIdx}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setSeasonIdx(i);
                  setEpisode(seasons[i]?.episodes?.[0] ?? null);
                }}
              >
                {seasons.map((s, i) => (
                  <option key={s.season} value={i}>{s.title ?? `Season ${s.season}`}</option>
                ))}
              </select>
            )}
          </div>
          <div className="episode-grid">
            {list.map((ep) => {
              const active = episode?.id === ep.id;
              const isResume = mode === "resume" && progress?.episodeId === ep.id;
              return (
                <button
                  key={ep.id}
                  className={`episode-card ${active ? "playing" : ""}`}
                  onClick={() => {
                    setEpisode(ep);
                    openPlayer(ep);
                  }}
                  aria-pressed={active}
                >
                  <span className="episode-thumb">
                    <SmartImage src={ep.thumb ?? item.backdrop} alt="" sizes="104px" />
                    <span className="play-mini"><IPlay /></span>
                  </span>
                  <span className="episode-info">
                    <span className="episode-title">
                      {ep.title}
                      {isResume && <span className="episode-resume">Resume</span>}
                    </span>
                    <span className="episode-sub">
                      S{String(ep.season).padStart(2, "0")} · E{String(ep.episode).padStart(2, "0")}
                      {ep.runtime ? ` · ${ep.runtime}m` : ""}
                      {isResume && progress ? ` · ${formatPosition(progress.position)}` : ""}
                    </span>
                    {ep.overview && <span className="episode-overview">{ep.overview}</span>}
                  </span>
                  <IChevronRight className="episode-check" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
