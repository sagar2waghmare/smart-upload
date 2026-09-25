import { env } from "cloudflare:workers";
import type { MediaKind } from "../types";

function tmdbApiKey(): string | undefined {
  return (env as { TMDB_API_KEY?: string }).TMDB_API_KEY || process.env.TMDB_API_KEY;
}
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";

export function tmdbConfigured(): boolean {
  return Boolean(tmdbApiKey());
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
  logo?: string;
  imdbId?: string;
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
  logo?: string;
  imdbId?: string;
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
  const apiKey = tmdbApiKey();
  if (!apiKey) throw new Error("TMDB API key not configured");

  // TMDB v3 API keys use the api_key query parameter. Some deployments may
  // provide a v4 Read Access Token instead, so fall back to Bearer auth if
  // the v3 request is rejected as unauthorized.
  const separator = path.includes("?") ? "&" : "?";
  const apiKeyUrl = `${TMDB_BASE}${path}${separator}api_key=${encodeURIComponent(apiKey)}`;
  // TMDB metadata is effectively immutable for our library. Cache the upstream
  // response at Cloudflare's edge so repeated searches/details do not hit TMDB.
  let res = await fetch(apiKeyUrl, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });

  if ((res.status === 401 || res.status === 403) && apiKey) {
    res = await fetch(`${TMDB_BASE}${path}`, {
      headers: { accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
  }

  if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
  return (await res.json()) as T;
}

function img(path?: string | null, size = "w342"): string | undefined {
  return path ? `${IMG}${size}${path}` : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/gi, "").replace(/\s+/g, " ").trim();
const stripTitle = (t: string) => t.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/\s+/g, " ").trim();

function score(query: string, resultTitle: string, resultYear: number | undefined, year?: number): number {
  const q = stripTitle(norm(query));
  const rt = stripTitle(norm(resultTitle));
  if (!q || !rt) return 0;
  const qWords = new Set(q.split(" "));
  const rWords = new Set(rt.split(" "));
  const overlap = [...qWords].filter((word) => rWords.has(word)).length;
  let s = rt === q ? 120 : rt.includes(q) ? 95 : q.includes(rt) ? 85 : overlap ? Math.min(75, 35 + overlap * 8) : 0;
  if (year && resultYear === year) s += 30;
  else if (year && resultYear && Math.abs(resultYear - year) <= 1) s += 8;
  return s;
}

type SearchRow = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

async function searchKind(type: "movie" | "tv", query: string, year?: number): Promise<TmdbResult | null> {
  if (!query.trim()) return null;
  const yearParam = year ? `&year=${year}` : "";
  const rows = await tmdb<{ results: SearchRow[] }>(`/search/${type}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US${yearParam}`);
  const scored = rows.results
    .filter((r) => r.id)
    .map((r) => {
      const title = r.title ?? r.name ?? r.original_title ?? r.original_name ?? "";
      const titleYear = Number(((r.release_date ?? r.first_air_date) ?? "").slice(0, 4)) || undefined;
      return { r, title, titleYear, s: score(query, title, titleYear, year) };
    })
    .filter((x) => x.s >= 35)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) return null;

  const best = scored[0];
  const id = best.r.id;
  const detail = await cached<Record<string, unknown>>(`${type}:${id}`, () =>
    tmdb<Record<string, unknown>>(`/${type === "tv" ? "tv" : "movie"}/${id}?language=en-US&append_to_response=images,external_ids&include_image_language=en-US,null`)
  );

  const foundYear =
    Number(((type === "tv" ? detail.first_air_date : detail.release_date) as string | undefined)?.slice(0, 4)) || best.titleYear;
  const title = (best.r.title ?? best.r.name ?? best.r.original_title ?? best.r.original_name ?? query).trim();
  const images = detail.images as { logos?: { file_path?: string; iso_639_1?: string | null; vote_average?: number }[] } | undefined;
  const logoPath = [...(images?.logos ?? [])]
    .filter((logo) => Boolean(logo.file_path))
    .sort((a, b) => {
      const aLang = a.iso_639_1 === "en" ? 0 : a.iso_639_1 === null ? 1 : 2;
      const bLang = b.iso_639_1 === "en" ? 0 : b.iso_639_1 === null ? 1 : 2;
      return (aLang - bLang) || ((b.vote_average ?? 0) - (a.vote_average ?? 0));
    })[0]?.file_path;

  const base = {
    title,
    year: foundYear,
    overview: (detail.overview as string) ?? undefined,
    rating: typeof detail.vote_average === "number" ? Number(detail.vote_average.toFixed(1)) : undefined,
    genres: ((detail.genres as { name?: string }[]) ?? []).map((g) => g.name ?? "").filter(Boolean),
    poster: img((detail.poster_path as string | null) ?? best.r.poster_path),
    backdrop: img((detail.backdrop_path as string | null) ?? best.r.backdrop_path, "w1280"),
    logo: img(logoPath, "w342"),
    imdbId: typeof (detail.external_ids as { imdb_id?: unknown } | undefined)?.imdb_id === "string"
      ? (detail.external_ids as { imdb_id: string }).imdb_id
      : undefined,
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
