"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AudioVariant, Episode, MediaItem } from "../../../lib/types";
import { VideoPlayer } from "../../../components/VideoPlayer";
import { FavButton } from "../../../components/FavButton";
import { SmartImage } from "../../../components/SmartImage";
import {
  IAlert,
  IArrowLeft,
  IChevronRight,
  IClock,
  IFilm,
  IPlay,
  IStar,
} from "../../../components/icons";

type ApiResult = {
  item: MediaItem;
  demo: boolean;
  canPlay: boolean;
  defaultUrl: string;
  shareUrl?: string;
  sourceType?: string;
  prepared?: boolean;
  playbackId?: string;
  audioTracks?: AudioVariant[];
};

export default function PlayPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [playback, setPlayback] = useState<ApiResult | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/play/${id}`)
      .then(async (r) => {
        setLoading(true);
        setError(null);
        if (r.status === 404) throw new Error("This title is not in your library yet.");
        const json = (await r.json()) as ApiResult;
        if (!alive) return;
        setData(json);
        setPlayback(json);

        const allEpisodes = json.item.seasons?.flatMap((season) => season.episodes) ?? [];
        const requestedEpisode = allEpisodes.find((ep) => ep.id === id) ?? allEpisodes[0] ?? null;
        setSeasonIdx(0);
        setEpisode(requestedEpisode);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message ?? "Something went wrong.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const item = data?.item;

  // Each episode can have its own browser-safe MP4 and AAC sidecars. Resolve
  // playback for the selected episode instead of reusing the first episode's
  // manifest. The existing direct /api/stream fallback remains available while
  // the manifest is loading.
  useEffect(() => {
    if (!item || item.kind === "movie" || !episode?.id) return;
    if (playback?.playbackId === episode.id) return;

    let alive = true;
    fetch(`/api/play/${encodeURIComponent(episode.id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Playback manifest returned ${r.status}`);
        return (await r.json()) as ApiResult;
      })
      .then((json) => {
        if (alive) setPlayback(json);
      })
      .catch((err) => {
        if (alive) {
          console.warn("[play-page] Episode playback manifest unavailable", err);
        }
      });

    return () => {
      alive = false;
    };
  }, [episode?.id, item, playback?.playbackId]);

  const seasons = useMemo(() => item?.seasons ?? [], [item]);
  const currentSeason = seasons[seasonIdx];
  const episodes = currentSeason?.episodes ?? [];

  const activePlayback = useMemo(() => {
    if (item?.kind === "movie") return data;
    if (!episode?.id) return null;
    return playback?.playbackId === episode.id ? playback : null;
  }, [data, episode?.id, item?.kind, playback]);

  const src = useMemo(() => {
    if (!data) return "";
    if (item?.kind === "movie") return data.canPlay ? data.defaultUrl : "";
    return activePlayback?.canPlay && activePlayback.defaultUrl
      ? activePlayback.defaultUrl
      : episode?.mediaUrl || item?.mediaUrl || (data.demo ? data.defaultUrl : "");
  }, [activePlayback, data, item, episode]);

  if (loading)
    return (
      <main className="page">
        <Link href="/" className="back-link"><IArrowLeft /> Back</Link>
        <div style={{ maxWidth: 640, margin: "3rem auto" }}>
          <div className="skeleton" style={{ aspectRatio: "16/9", borderRadius: "var(--radius-xl)" }} />
          <div className="skeleton skel-line" />
          <div className="skeleton skel-line short" />
        </div>
      </main>
    );

  if (error || !item || !data)
    return (
      <main className="page">
        <Link href="/" className="back-link"><IArrowLeft /> Back</Link>
        <div className="state-box" style={{ marginTop: "2rem" }}>
          <IAlert />
          <h3>Playback unavailable</h3>
          <p>{error ?? "This title could not be loaded."}</p>
          <Link href="/" className="btn btn-primary">Back to library</Link>
        </div>
      </main>
    );

  const hasEpisodes = episodes.length > 0;

  return (
    <main className="page">
      <Link href="/" className="back-link"><IArrowLeft /> Back to library</Link>

      <div className="details-banner reveal">
        <div className="details-banner-bg">
          <SmartImage src={item.backdrop ?? item.poster} alt="" sizes="100vw" objectPosition="center 30%" />
        </div>
        <div className="details-banner-shade" />
        <div className="details-banner-copy">
          <div className="eyebrow">{item.kind === "movie" ? "NOW PLAYING" : item.kind === "anime" ? "ANIME" : "EPISODE"}</div>
          <h1>{item.title}</h1>
          <div className="hero-meta">
            {item.year ?? "—"}
            {item.rating ? <><b className="dot">•</b><span style={{ display: "inline-flex", alignItems: "center", gap: ".3em" }}><IStar style={{ width: ".95em", height: ".95em", color: "var(--cor-nota)" }} /> {item.rating.toFixed(1)}</span></> : null}
            {item.runtime ? <><b className="dot">•</b><span style={{ display: "inline-flex", alignItems: "center", gap: ".3em" }}><IClock style={{ width: ".95em", height: ".95em" }} /> {Math.floor(item.runtime / 60)}h {item.runtime % 60}m</span></> : null}
          </div>
          {hasEpisodes && episode && (
            <span className="pill pill-primary" style={{ marginTop: ".6em" }}>
              S{String(episode.season).padStart(2, "0")} · E{String(episode.episode).padStart(2, "0")} — {episode.title}
            </span>
          )}
          <div className="details-actions">
            <FavButton id={item.id} labelStyle="chip" />
          </div>
        </div>
      </div>

      <div className="player-shell">
        {data.canPlay || src ? (
          <VideoPlayer
            key={src}
            src={src}
            sourceType={activePlayback?.sourceType ?? data.sourceType}
            shareUrl={activePlayback?.shareUrl ?? data.shareUrl}
            poster={item.poster}
            backdrop={item.backdrop}
            title={item.title}
            episodeTitle={episode?.title}
            demo={data.demo}
            item={item}
            episode={episode}
            onEpisode={hasEpisodes ? (ep) => setEpisode(ep) : undefined}
            audioTracks={activePlayback?.audioTracks ?? []}
            preparedBrowserCopy={Boolean(activePlayback?.prepared)}
          />
        ) : (
          <div className="state-box" style={{ borderRadius: "var(--radius-xl)", border: 0 }}>
            <IFilm />
            <h3>Stream not configured</h3>
            <p>
              This media item has no playback source yet. Point <code>AWS_LIBRARY_API_URL</code> at your AWS media API,
              or set <code>NEXT_PUBLIC_DEMO_VIDEO_URL</code> for a demo stream.
            </p>
            <Link href="/settings" className="btn btn-secondary">View integration status</Link>
          </div>
        )}
      </div>

      {/* movie details */}
      {!hasEpisodes && (
        <section className="details-grid" style={{ marginTop: "2rem" }}>
          <div className="details-poster">
            <SmartImage src={item.poster} alt={`${item.title} poster`} sizes="320px" />
          </div>
          <div className="details-right">
            <div>
              <h2 style={{ margin: "0 0 .6em", fontSize: "var(--text-xl)", letterSpacing: "-.02em" }}>About</h2>
              {item.overview && <p style={{ color: "var(--text-2)", lineHeight: 1.65, margin: 0 }}>{item.overview}</p>}
              <div className="details-genres" style={{ marginTop: "1rem" }}>
                {(item.genres ?? []).map((g) => (
                  <span key={g} className="pill pill-neutral">{g}</span>
                ))}
              </div>
            </div>
            <div className="details-stats">
              <span>Year <b>{item.year ?? "—"}</b></span>
              <span>Runtime <b>{item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : "—"}</b></span>
              <span>Rating <b>{item.rating ? `${item.rating.toFixed(1)} / 10` : "—"}</b></span>
              <span>Source <b>{data.demo ? "demo preview" : item.source ?? "aws"}</b></span>
            </div>
          </div>
        </section>
      )}

      {/* episodes */}
      {hasEpisodes && (
        <section aria-label="Episodes" style={{ marginTop: "2rem" }}>
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
            {episodes.map((ep) => {
              const active = episode?.id === ep.id;
              return (
                <button
                  key={ep.id}
                  className={`episode-card ${active ? "playing" : ""}`}
                  onClick={() => setEpisode(ep)}
                  aria-pressed={active}
                >
                  <span className="episode-thumb">
                    <SmartImage src={ep.thumb ?? item.backdrop} alt="" sizes="104px" />
                    <span className="play-mini"><IPlay /></span>
                  </span>
                  <span className="episode-info">
                    <span className="episode-title">{ep.title}</span>
                    <span className="episode-sub">S{String(ep.season).padStart(2, "0")} · E{String(ep.episode).padStart(2, "0")}{ep.runtime ? ` · ${ep.runtime}m` : ""}</span>
                    {ep.overview && <span className="episode-overview">{ep.overview}</span>}
                  </span>
                  <IChevronRight className="episode-check" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}