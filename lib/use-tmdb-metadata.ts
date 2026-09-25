"use client";
import { useEffect, useMemo, useState } from "react";
import type { MediaItem } from "./types";

export interface TmdbMetaEnrich {
  title?: string;
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

type MetaState = {
  matched: boolean;
  loading: boolean;
  meta: TmdbMetaEnrich | null;
};

const cache = new Map<string, TmdbMetaEnrich | null>();

function metaType(kind?: MediaItem["kind"]): "movie" | "series" {
  return kind === "movie" ? "movie" : "series";
}

function itemMeta(item: MediaItem | null): TmdbMetaEnrich | null {
  if (!item || !item.tmdbId) return null;

  const meta: TmdbMetaEnrich = {
    title: item.title,
    year: typeof item.year === "number" ? item.year : Number(item.year) || undefined,
    overview: item.overview,
    runtime: item.runtime,
    rating: item.rating,
    genres: item.genres,
    poster: item.poster,
    backdrop: item.backdrop,
    logo: item.logo,
  };

  return meta.overview || meta.poster || meta.backdrop || meta.rating !== undefined ? meta : null;
}

async function fetchMeta(
  title: string,
  year: string | number | undefined,
  kind?: MediaItem["kind"],
): Promise<TmdbMetaEnrich | null> {
  try {
    const params = new URLSearchParams({ query: title, type: metaType(kind) });
    if (year) params.set("year", String(year));
    const res = await fetch(`/api/metadata?${params.toString()}`, {
      cache: "default",
      credentials: "same-origin",
    });
    const json = (await res.json()) as { matched?: boolean; meta?: TmdbMetaEnrich };
    if (!res.ok || json.matched !== true || !json.meta) return null;
    return json.meta;
  } catch {
    return null;
  }
}

function initialFromKey(key: string, item: MediaItem | null): MetaState {
  if (!key) return { matched: false, loading: false, meta: null };

  if (cache.has(key)) {
    const m = cache.get(key) ?? null;
    return { matched: Boolean(m), loading: false, meta: m };
  }

  const embedded = itemMeta(item);
  if (embedded) {
    return {
      matched: true,
      loading: Boolean(item?.tmdbId && !embedded.logo),
      meta: embedded,
    };
  }

  return { matched: false, loading: true, meta: null };
}

export function useTmdbMeta(item: MediaItem | null): MetaState {
  const title = item?.title ?? "";
  const year = item?.year;
  const kind = item?.kind;
  const key = item ? `${metaType(kind)}|${title}|${year ?? ""}` : "";
  const embedded = itemMeta(item);
  const [state, setState] = useState<MetaState>(() => initialFromKey(key, item));
  const [lastKey, setLastKey] = useState(key);

  if (key !== lastKey) {
    setLastKey(key);
    setState(initialFromKey(key, item));
  }

  useEffect(() => {
    if (!item || !key || (cache.has(key) && Boolean(cache.get(key)?.logo))) return;

    let alive = true;
    const run = async () => {
      const m = embedded?.logo ? embedded : (await fetchMeta(title, year, kind));
      if (alive) {
        cache.set(key, m);
        setState({ matched: Boolean(m), loading: false, meta: m });
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [item, key, title, year, kind, embedded]);

  return useMemo(() => state, [state]);
}
