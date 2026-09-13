import type { IdentifyResult } from "./types";
import { parseFilename } from "./media/detect";
import { searchTmdb, tmdbConfigured } from "./metadata/tmdb";

export async function identifyFilename(raw: string, opts: { year?: number } = {}): Promise<IdentifyResult> {
  const parsed = parseFilename(raw);
  const year = opts.year ?? parsed.year;
  const base = {
    raw,
    normalizedTitle: parsed.titleKey,
    title: parsed.title,
    year,
    kind: parsed.kind,
    season: parsed.season,
    episode: parsed.episode,
    resolution: parsed.resolution,
    group: parsed.group,
    confidence: parsed.confidence,
    source: "demo-detector",
  };

  if (!tmdbConfigured()) {
    return { ...base, tmdb: { matched: false, mode: "not-configured" } };
  }

  try {
    const result = await searchTmdb(parsed.titleKey, { year, kind: parsed.kind });
    if (!result) {
      return { ...base, tmdb: { matched: false, mode: "tmdb" } };
    }
    const isShow = result.tmdbType === "tv";
    return {
      ...base,
      title: result.meta.title,
      kind: isShow ? (parsed.animeHint ? "anime" : "series") : parsed.kind,
      source: "tmdb",
      tmdb: {
        matched: true,
        mode: "tmdb",
        id: result.meta.tmdbId,
        title: result.meta.title,
        poster: result.meta.poster,
        backdrop: result.meta.backdrop,
      },
    };
  } catch {
    return { ...base, tmdb: { matched: false, mode: "error" } };
  }
}