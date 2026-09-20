"use client";

import { useEffect, useMemo, useState } from "react";
import type { Episode, MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { useDetails } from "./DetailsProvider";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useTmdbMeta } from "../lib/use-tmdb-metadata";
import { IClose, IImage, IPlay, IChevronRight } from "./icons";

const tabs = ["Episodes", "More Like This", "Trailers"] as const;
type Tab = (typeof tabs)[number];

export function DetailsOverlay() {
  const { item, openDetails, openPlayer, closeDetails } = useDetails();
  const [tab, setTab] = useState<Tab>("More Like This");
  const [seasonIndex, setSeasonIndex] = useState(0);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const tmdb = useTmdbMeta(item);

  useEffect(() => {
    if (!item) return;
    setTab(item.seasons?.length ? "Episodes" : "More Like This");
    setSeasonIndex(0);
    loadLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, [item]);

  const seasons = item?.seasons ?? [];
  const currentSeason = seasons[seasonIndex];
  const episodes = currentSeason?.episodes ?? [];
  const similar = useMemo(
    () => library.filter((m) => m.id !== item?.id).slice(0, 9),
    [library, item?.id],
  );

  if (!item) return null;

  const meta = tmdb.meta;
  const title = meta?.title || item.title;
  const backdrop = meta?.backdrop || item.backdrop || item.poster;
  const overview = meta?.overview || item.overview || "";
  const genres = meta?.genres?.length ? meta.genres : item.genres ?? [];
  const cast = meta?.cast?.length ? meta.cast : item.cast ?? [];
  const creator = meta?.creator || item.creator;
  const rating = meta?.rating ?? item.rating;
  const year = meta?.year ?? item.year;
  const runtime = meta?.runtime ?? item.runtime;
  const match = rating ? Math.min(99, Math.round(76 + rating * 2.4)) : 90;

  return (
    <div className="details-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button className="details-back" onClick={closeDetails} aria-label="Close">
        <IClose />
      </button>

      <div className="details-hero">
        <div className="details-hero-bg">
          <SmartImage src={backdrop} alt="" sizes="100vw" priority />
        </div>
        <div className="details-hero-shade" />
      </div>

      <div className="source-netflix-details-body">
        <h1 className="source-netflix-detail-title">{title}</h1>

        <div className="source-netflix-meta">
          <span className="source-netflix-match">{match}% Match</span>
          {year ? <span>{year}</span> : null}
          {rating ? <span className="source-netflix-pill">{rating.toFixed(1)}</span> : null}
          <span>
            {seasons.length
              ? seasons.length + (seasons.length === 1 ? " Season" : " Seasons")
              : runtime
                ? Math.floor(runtime / 60) + "h " + (runtime % 60) + "m"
                : "Movie"}
          </span>
          <span className="source-netflix-hd">HD</span>
        </div>

        <button className="source-netflix-detail-primary" onClick={() => openPlayer(episodes[0])}>
          <IPlay /> Play
        </button>
        <button className="source-netflix-detail-secondary" type="button">
          <IImage /> Download
        </button>

        {overview && <p className="source-netflix-synopsis">{overview}</p>}

        <div className="source-netflix-cast">
          {cast.length ? <span><span className="dim">Cast: </span>{cast.join(", ")}</span> : null}
          {creator ? <span><span className="dim">Creator: </span>{creator}</span> : null}
          {genres.length ? <span><span className="dim">Genres: </span>{genres.join(", ")}</span> : null}
        </div>

        <div className="source-netflix-actions">
          <FavButton id={item.id} labelStyle="chip" />
          <button className="source-netflix-action" type="button"><span>Rate</span></button>
          <button className="source-netflix-action" type="button"><span>Share</span></button>
          <button className="source-netflix-action" type="button"><span>Download</span></button>
        </div>

        <div className="source-netflix-tabs">
          {tabs.filter((t) => t !== "Episodes" || seasons.length > 0).map((t) => (
            <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Episodes" && seasons.length > 0 && (
          <section className="source-netflix-episodes" aria-label="Episodes">
            {seasons.length > 1 && (
              <select
                className="source-netflix-season-select"
                value={seasonIndex}
                onChange={(e) => setSeasonIndex(Number(e.target.value))}
                aria-label="Season"
              >
                {seasons.map((s, i) => (
                  <option key={s.season} value={i}>{s.title || "Season " + s.season}</option>
                ))}
              </select>
            )}

            {episodes.map((ep) => (
              <button key={ep.id} type="button" className="source-netflix-episode" onClick={() => openPlayer(ep)}>
                <span className="source-netflix-episode-thumb">
                  <img src={ep.thumb ?? backdrop} alt="" />
                  <span className="source-netflix-episode-play"><IPlay /></span>
                </span>
                <span className="source-netflix-episode-info">
                  <span className="source-netflix-episode-head">
                    <span className="source-netflix-episode-title">{ep.episode}. {ep.title}</span>
                    <span className="source-netflix-episode-time">{ep.runtime ? ep.runtime + "m" : ""}</span>
                  </span>
                  <span className="source-netflix-episode-desc">
                    S{String(ep.season).padStart(2, "0")} · E{String(ep.episode).padStart(2, "0")}
                    {ep.overview ? " · " + ep.overview : ""}
                  </span>
                </span>
                <IChevronRight className="source-netflix-episode-arrow" />
              </button>
            ))}
          </section>
        )}

        {tab === "More Like This" && (
          <div className="source-netflix-grid">
            {similar.map((m) => (
              <button key={m.id} type="button" onClick={() => openDetails(m)}>
                <SmartImage src={m.poster} alt={m.title + " poster"} />
              </button>
            ))}
          </div>
        )}

        {tab === "Trailers" && (
          <div className="source-netflix-trailers">
            {["Official Trailer", "Teaser", "Behind the Scenes"].map((name) => (
              <div key={name} className="source-netflix-trailer">
                <div className="source-netflix-trailer-thumb">
                  <img src={backdrop ?? item.poster} alt="" />
                  <span className="source-netflix-trailer-play"><IPlay /></span>
                  <span className="source-netflix-trailer-runtime">0:45</span>
                </div>
                <span className="source-netflix-trailer-name">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
