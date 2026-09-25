import type { IdentifyResult } from "./types";
import { parseFilename } from "./media/detect";
import { searchTmdb, tmdbConfigured } from "./metadata/tmdb";

function tmdbQueries(raw: string, parsedTitle: string): string[] {
  const clean = raw
    .replace(/\.(mkv|mp4|avi|mov|wmv|ts|m2ts|flv|webm|m4v|mpg|mpeg)$/i, "")
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/[._+\-]+/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:2160p|1080p|720p|480p|360p|4k|x264|x265|h264|h265|hevc|avc|aac|ac3|dts|truehd|atmos|bluray|remux|bdrip|brrip|webrip|web-dl|webdl|webtv|hdtv|hdrip|dvdrip|uhd|hdr|proper|repack|extended|uncut|unrated|complete|batch|dubbed|subbed)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([parsedTitle, clean].filter((q) => q.length >= 2))];
}

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

  if (!tmdbConfigured()) return { ...base, tmdb: { matched: false, mode: "not-configured" } };

  try {
    for (const query of tmdbQueries(raw, parsed.title)) {
      const result = await searchTmdb(query, { year, kind: parsed.kind, details: false });
      if (!result?.meta.poster) continue;
      const isShow = result.tmdbType === "tv";
      return {
        ...base,
        normalizedTitle: query.toLowerCase(),
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
          logo: result.meta.logo,
          overview: result.meta.overview,
          runtime: result.tmdbType === "movie" ? result.meta.runtime : undefined,
          rating: result.meta.rating,
          genres: result.meta.genres,
        },
      };
    }
    return { ...base, tmdb: { matched: false, mode: "tmdb" } };
  } catch {
    return { ...base, tmdb: { matched: false, mode: "error" } };
  }
}