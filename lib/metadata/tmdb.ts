import type { MediaKind } from "../types";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";

export function tmdbConfigured(): boolean {
  return Boolean(TMDB_API_KEY);
}

export interface TmdbMovie {
  tmdbType: "movie";
  tmdbId: number;
  title: string;
  year?: number;
  overview?: string;
  runtime?: number;
  rating?: number;
  genres?: string[];
  poster?: string;
  backdrop?: string;
}

export interface TmdbEpisodeMeta {
  season: number;
  episode: number;
  title: string;
  overview?: string;
  runtime?: number;
  thumb?: string;
}

export interface TmdbSeasonMeta {
  season: number;
  title?: string;
  episodes: TmdbEpisodeMeta[];
}

export interface TmdbSeries {
  tmdbType: "tv";
  tmdbId: number;
  title: string;
  year?: number;
  overview?: string;
  rating?: number;
  genres?: string[];
  poster?: string;
  backdrop?: string;
  seasons?: TmdbSeasonMeta[];
}

export type TmdbResult = { tmdbType: "movie"; meta: TmdbMovie } | { tmdbType: "tv"; meta: TmdbSeries };

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 30 * 60 * 1000;

function cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data as T);
  return producer().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

async function tmdb<T>(path: string): Promise<T> {
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${TMDB_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
  return (await res.json()) as T;
}

function img(path?: string | null, size = "w500"): string | undefined {
  return path ? `${IMG}${size}${path}` : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/gi, "").replace(/\s+/g, " ").trim();
const stripTitle = (t: string) => t.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/\s+/g, " ").trim();

function score(query: string, resultTitle: string, resultYear: number | undefined, year?: number): number {
  const q = norm(query);
  const rt = stripTitle(norm(resultTitle));
  let s = rt === q ? 100 : rt.includes(q) ? 80 : q.includes(rt) ? 60 : 0;
  if (year && resultYear === year) s += 15;
  return s;
}

type SearchRow = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
};

async function searchKind(type: "movie" | "tv", query: string, year?: number): Promise<TmdbResult | null> {
  const rows = await tmdb<{ results: SearchRow[] }>(`/search/${type}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US`);
  const scored = rows.results
    .filter((r) => r.id)
    .map((r) => {
      const title = r.title ?? r.name ?? "";
      const titleYear = Number(((r.release_date ?? r.first_air_date) ?? "").slice(0, 4)) || undefined;
      return { r, s: score(query, title, titleYear, year) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) return null;

  const id = scored[0].r.id;
  const detail = await cached<Record<string, unknown>>(`${type}:${id}`, () =>
    tmdb<Record<string, unknown>>(`${type === "tv" ? "tv" : "movie"}/${id}?language=en-US`)
  );

  const foundYear =
    Number(((type === "tv" ? detail.first_air_date : detail.release_date) as string | undefined)?.slice(0, 4)) || undefined;
  const title = (scored[0].r.title ?? scored[0].r.name ?? query).trim();
  const base = {
    title,
    year: foundYear,
    overview: (detail.overview as string) ?? undefined,
    rating: typeof detail.vote_average === "number" ? Number(detail.vote_average.toFixed(1)) : undefined,
    genres: ((detail.genres as { name?: string }[]) ?? []).map((g) => g.name ?? "").filter(Boolean),
    poster: img(detail.poster_path as string | null),
    backdrop: img(detail.backdrop_path as string | null, "w1280"),
  };

  if (type === "tv") {
    const seasons = ((detail.seasons as { season_number?: number; name?: string }[]) ?? [])
      .filter((s) => Number(s.season_number) > 0)
      .map((s) => ({ season: Number(s.season_number), title: s.name ? `Season ${s.season_number}` : undefined, episodes: [] as TmdbEpisodeMeta[] }));
    return { tmdbType: "tv", meta: { tmdbType: "tv", tmdbId: id, ...base, seasons } as TmdbSeries };
  }

  return {
    tmdbType: "movie",
    meta: {
      tmdbType: "movie",
      tmdbId: id,
      ...base,
      runtime: typeof detail.runtime === "number" ? detail.runtime : undefined,
    } as TmdbMovie,
  };
}

export async function searchTmdb(query: string, opts: { year?: number; kind?: MediaKind } = {}): Promise<TmdbResult | null> {
  const key = `s:${opts.kind ?? ""}:${norm(query)}:${opts.year ?? ""}`;
  const run = async (): Promise<TmdbResult | null> => {
    if (opts.kind === "series" || opts.kind === "anime") return searchKind("tv", query, opts.year);
    if (opts.kind === "movie") return searchKind("movie", query, opts.year);

    const [movie, tv] = await Promise.all([
      searchKind("movie", query, opts.year),
      searchKind("tv", query, opts.year),
    ]);
    const mScore = movie ? score(query, movie.meta.title, movie.meta.year, opts.year) : -1;
    const tScore = tv ? score(query, tv.meta.title, tv.meta.year, opts.year) : -1;
    if (mScore >= tScore && movie) return movie;
    return tv;
  };
  return cached(key, run);
}

export async function getEpisodeMeta(tmdbId: number, season: number): Promise<TmdbEpisodeMeta[] | null> {
  const key = `eps:${tmdbId}:${season}`;
  return cached(key, async () => {
    const d = await tmdb<{ episodes?: Record<string, unknown>[] }>(`/tv/${tmdbId}/season/${season}?language=en-US`);
    if (!d.episodes) return null;
    return d.episodes
      .filter((e) => Number(e.episode_number) > 0)
      .map((e) => ({
        season,
        episode: Number(e.episode_number),
        title: (e.name as string) ?? `Episode ${e.episode_number}`,
        overview: (e.overview as string) ?? undefined,
        runtime: typeof e.runtime === "number" ? e.runtime : undefined,
        thumb: img(e.still_path as string | null, "w300"),
      }));
  });
}