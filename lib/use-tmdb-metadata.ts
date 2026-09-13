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
}

type MetaState = {
  matched: boolean;
  loading: boolean;
  meta: TmdbMetaEnrich | null;
};

const cache = new Map<string, TmdbMetaEnrich | null>();

function metaType(kind?: MediaItem["kind"]): "movie" | "series" {
  if (kind === "movie") return "movie";
  return "series";
}

async function fetchMeta(title: string, year: string | number | undefined, kind?: MediaItem["kind"]): Promise<TmdbMetaEnrich | null> {
  try {
    const params = new URLSearchParams({ query: title, type: metaType(kind) });
    if (year) params.set("year", String(year));
    const res = await fetch(`/api/metadata?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as { matched?: boolean; meta?: TmdbMetaEnrich };
    if (!res.ok || json.matched !== true || !json.meta) return null;
    return json.meta;
  } catch {
    return null;
  }
}

function initialFromKey(key: string): MetaState {
  if (!key) return { matched: false, loading: false, meta: null };
  if (cache.has(key)) {
    const m = cache.get(key) ?? null;
    return { matched: Boolean(m), loading: false, meta: m };
  }
  return { matched: false, loading: true, meta: null };
}

export function useTmdbMeta(item: MediaItem | null): MetaState {
  const title = item?.title ?? "";
  const year = item?.year;
  const kind = item?.kind;
  const key = item ? `${metaType(kind)}|${title}|${year ?? ""}` : "";
  const [state, setState] = useState<MetaState>(() => initialFromKey(key));
  const [lastKey, setLastKey] = useState(key);

  if (key !== lastKey) {
    setLastKey(key);
    setState(initialFromKey(key));
  }

  useEffect(() => {
    if (!item) return;
    if (cache.has(key)) return;
    let alive = true;
    const run = async () => {
      const m = await fetchMeta(title, year, kind);
      if (alive) {
        cache.set(key, m);
        setState({ matched: Boolean(m), loading: false, meta: m });
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [item, key, title, year, kind]);

  return useMemo(() => state, [state]);
}