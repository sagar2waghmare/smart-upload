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

const YEAR_RE = /(?:^|[^0-9])(19\d{2}|20\d{2})(?!\d)/;
const SERIES_RE = /\bS(\d{1,2})\s*E(\d{1,3})\b/i;
const SEASON_WORD_RE = /\b(?:season|s)\s*\.?\s*(\d{1,2})\b/i;
const EPISODE_WORD_RE = /\b(?:episode|ep)\s*\.?\s*\.?(\d{1,3})\b/i;
const EPISODE_ONLY_RE = /\bE(\d{1,3})\b/i;
const RES_RE = /\b(2160p|1080p|720p|480p|360p|4k|\d{3,4}x\d{3,4})\b/i;
const GROUP_RE = /-([a-z0-9.\-_\[\]]{2,})$/i;

const CANON_TITLE_SEPS = /[._+\-/]+/g;

const noiseTokens = new Set([
  "x264","x265","h264","h265","hevc","avc","aac","ac3","dts","dtshd","truehd","atmos",
  "bluray","blurayremux","remux","bdrip","brrip","webrip","web-dl","webdl","webtv","hdtv",
  "hdrip","dvdrip","uhd","hdr","dv","do","hlg","xvid","dvd","criterion","proper","repack",
  "extended","uncut","unrated","directorscut","director'scut","complete","batch","part","nfo",
  "s01","s02","s03","s04","s05","s06","s07","s08","s09","s10","dubbed","subbed","tv","anime",
  "hin","eng","hindi","english","aac2","dd","ddp","dd5","dd5.1","5.1","2.0","640k","esub","subs","multi",
  "jiohs","amzn","nf","netflix","prime","web-dl","webdl","vegamovies","vegamovies.to","1vegamovies","1vegamovies.tw",
  "movies4u","movies4u.foo","foo","1080","2160","720","480","x265","10bit","8bit","10bits",
]);

const junkSuffixPatterns = [
  /\b(?:www\.)?vegamovies(?:\.(?:to|tw|foo|site))?\b/gi,
  /\bmovies4u(?:\.(?:foo|to|site))?\b/gi,
  /\b(?:1|www)vegamovies(?:\.(?:to|tw|foo|site))?\b/gi,
];

const animeGroupHints = ["subsplease","erairaws","horriblesubs","anime","[subsplease]","[erai-raws]"];

function tokenizeName(name: string): string[] {
  let cleaned = name;
  for (const pattern of junkSuffixPatterns) cleaned = cleaned.replace(pattern, " ");
  return cleaned
    .replace(/\.(mkv|mp4|avi|mov|wmv|ts|m2ts|flv|webm|m4v|mpg|mpeg)$/i, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .split(/[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff'-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function cleanTitleTokens(tokens: string[], kind: MediaKind, year?: number): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    const low = token.toLowerCase();
    if (noiseTokens.has(low)) continue;
    if (year && low === String(year)) break;
    if (/^(19|20)\d{2}$/.test(token)) break;
    if (/^(2160p|1080p|720p|480p|360p|4k)$/i.test(token)) break;
    if (/^\d{3,4}x\d{3,4}$/i.test(token)) break;
    if (/^s\d{1,2}e\d{1,3}$/i.test(token)) break;
    if (/^s\d{1,2}$/i.test(token) && kind !== "movie") break;
    if (/^e\d{1,3}$/i.test(token) && kind !== "movie") break;
    result.push(token);
  }
  return result;
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

  const titleTokens = cleanTitleTokens(tokens, kind, year);
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