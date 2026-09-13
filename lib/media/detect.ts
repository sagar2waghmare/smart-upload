import type { MediaKind } from "../types";

export interface ParsedFilename {
  title: string;
  titleKey: string;
  year?: number;
  kind: MediaKind;
  season?: number;
  episode?: number;
  resolution?: string;
  group?: string;
  animeHint: boolean;
  confidence: number;
  pattern: string;
}

const YEAR_RE = /(19\d{2}|20\d{2})/;
const SERIES_RE = /\bS(\d{1,2})\s*E(\d{1,3})\b/i;
const SEASON_WORD_RE = /\b(?:season|s)\s*\.?\s*(\d{1,2})\b/i;
const EPISODE_WORD_RE = /\b(?:episode|ep)\s*\.?\s*\.?(\d{1,3})\b/i;
const EPISODE_ONLY_RE = /\bE(\d{1,3})\b/i;
const RES_RE = /\b(2160p|1080p|720p|480p|360p|4k|\d{3,4}x\d{3,4})\b/i;
const GROUP_RE = /-([a-z0-9.\-_\[\]]{2,})$/i;

const CANON_TITLE_SEPS = /[._+\-/]/g;

const noiseTokens = new Set([
  "x264","x265","h264","h265","hevc","avc","aac","ac3","dts","dtshd","truehd","atmos",
  "bluray","blurayremux","remux","bdrip","brrip","webrip","web-dl","webdl","webtv","hdtv",
  "hdrip","dvdrip","uhd","hdr","dv","do","hlg","xvid","dvd","criterion","proper","repack",
  "extended","uncut","unrated","directorscut","director'scut","complete","batch","part","nfo",
  "s01","s02","s03","s04","s05","s06","s07","s08","s09","s10","dubbed","subbed","tv","anime",
]);

const animeGroupHints = ["subsplease","erairaws","horriblesubs","anime","[subsplease]","[erai-raws]"];

function tokenizeName(name: string): string[] {
  return name
    .replace(/\.(mkv|mp4|avi|mov|wmv|ts|m2ts|flv|webm|m4v|mpg|mpeg)$/i, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .split(/[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff'-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseFilename(raw: string): ParsedFilename {
  const tokens = tokenizeName(raw);
  const yearMatch = raw.match(YEAR_RE);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;

  const sMatch = raw.match(SERIES_RE);
  const seasonWord = raw.match(SEASON_WORD_RE);
  const epWord = raw.match(EPISODE_WORD_RE);
  const epOnly = raw.match(EPISODE_ONLY_RE);

  let season: number | undefined;
  let episode: number | undefined;
  let pattern = "movie-singleton";
  let kind: MediaKind = "movie";
  let confidence = 0.5;

  if (sMatch) {
    season = Number(sMatch[1]);
    episode = Number(sMatch[2]);
    pattern = "series-SxxExx";
    kind = "series";
    confidence = 0.95;
  } else if (seasonWord && epWord) {
    season = Number(seasonWord[1]);
    episode = Number(epWord[1]);
    pattern = "series-season-wording";
    kind = "series";
    confidence = 0.93;
  } else if (epWord || epOnly) {
    episode = Number((epWord ?? epOnly)?.[1]);
    pattern = "series-episode-only";
    kind = "series";
    confidence = 0.8;
  } else if (year) {
    pattern = "movie-with-year";
    kind = "movie";
    confidence = 0.78;
  }

  const resolutionMatch = raw.match(RES_RE);
  const resolution = resolutionMatch ? resolutionMatch[1].toLowerCase() : undefined;
  const groupMatch = raw.match(GROUP_RE);
  const group = groupMatch ? groupMatch[1].trim() : undefined;

  const animeHint = tokens.some((t) => animeGroupHints.includes(t.toLowerCase())) || /[\u3040-\u30ff\u4e00-\u9fff]/u.test(raw);
  if (animeHint && kind === "series") kind = "anime";

  const titleTokens = tokens.filter((t) => {
    const low = t.toLowerCase();
    if (noiseTokens.has(low)) return false;
    if (/^(19|20)\d{2}$/.test(t)) return false;
    if (/^(2160p|1080p|720p|480p|360p|4k)$/i.test(t)) return false;
    if (/^s\d{1,2}e\d{1,3}$/i.test(t)) return false;
    if (/^s\d{1,2}$/i.test(t) && kind !== "movie") return false;
    if (/^e\d{1,3}$/i.test(t) && kind !== "movie") return false;
    return true;
  });

  const title = titleTokens.join(" ").replace(/\s+/g, " ").trim() || (tokens[0] ?? "");
  const titleKey = title.replace(CANON_TITLE_SEPS, " ").replace(/\s+/g, " ").trim().toLowerCase();

  return {
    title,
    titleKey,
    year,
    kind,
    season,
    episode,
    resolution,
    group,
    animeHint,
    confidence,
    pattern,
  };
}