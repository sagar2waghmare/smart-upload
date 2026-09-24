import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import { identifyFilename } from "./identify";
import { tmdbConfigured } from "./metadata/tmdb";
import { parseFilename } from "./media/detect";
import {
  getCachedDriveLibrary,
  setCachedDriveLibrary,
  getCachedMetadata,
  metadataCacheKey,
  setCachedMetadata,
  NEGATIVE_METADATA_EXPIRATION_TTL,
} from "./library-cache";
import type {
  Episode,
  LibraryEnrichmentPatch,
  LibraryEnrichmentTarget,
  LibraryResponse,
  MediaItem,
  MediaKind,
  Season,
} from "./types";

type RawItem = {
  id: string;
  name: string;
  type: MediaKind;
  modifiedTime?: string;
};

type CachedMetadata = {
  status: "matched" | "not-found";
  title?: string;
  year?: string | number;
  kind?: MediaKind;
  tmdbId?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  runtime?: number;
  rating?: number;
  genres?: string[];
};

const RAW_MEMORY_TTL_MS = 15_000;
const LIBRARY_MEMORY_TTL_MS = 10_000;

let rawMemoryCache: { items: RawItem[]; expiresAt: number } | null = null;
let libraryMemoryCache: { value: LibraryResponse; expiresAt: number } | null = null;

function metadataKeyForRaw(raw: RawItem): string {
  const parsed = parseFilename(raw.name);
  const titleKey = parsed.titleKey || parsed.title || raw.name.replace(/\.[^.]+$/, "");
  return metadataCacheKey(raw.type, titleKey, parsed.year);
}

function baseItem(raw: RawItem): MediaItem | null {
  const id = raw.id.trim();
  const filename = raw.name.trim();
  if (!id || !filename) return null;

  const fallbackTitle = filename.replace(/\.[^.]+$/, "").trim();
  if (!fallbackTitle) return null;

  const parsed = parseFilename(filename);
  const title = parsed.title || fallbackTitle;

  return {
    id,
    kind: raw.type,
    title,
    year: parsed.year,
    season: raw.type === "movie" ? undefined : parsed.season,
    episode: raw.type === "movie" ? undefined : parsed.episode,
    // Keep Google Drive thumbnails behind our authenticated proxy. Never expose
    // the Drive thumbnailLink directly to the browser.
    poster: `/api/thumbnail/${encodeURIComponent(id)}`,
    backdrop: `/api/thumbnail/${encodeURIComponent(id)}`,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };
}

function applyCachedMetadata(item: MediaItem, cached?: CachedMetadata | null): MediaItem {
  if (!cached || cached.status !== "matched") return item;

  return {
    ...item,
    title: cached.title || item.title,
    year: cached.year ?? item.year,
    kind: cached.kind ?? item.kind,
    tmdbId: cached.tmdbId ?? item.tmdbId,
    poster: cached.poster || item.poster,
    backdrop: cached.backdrop || item.backdrop,
    overview: cached.overview ?? item.overview,
    runtime: cached.runtime ?? item.runtime,
    rating: cached.rating ?? item.rating,
    genres: cached.genres ?? item.genres,
  };
}

function toClientPatch(id: string, cached: CachedMetadata): LibraryEnrichmentPatch {
  if (cached.status !== "matched") return { id };
  return {
    id,
    title: cached.title,
    year: cached.year,
    kind: cached.kind,
    tmdbId: cached.tmdbId,
    poster: cached.poster,
    backdrop: cached.backdrop,
    overview: cached.overview,
    runtime: cached.runtime,
    rating: cached.rating,
    genres: cached.genres,
  };
}

function groupKey(item: MediaItem): string {
  const kind = item.kind === "anime" ? "anime" : "series";
  const identity = item.tmdbId
    ? `tmdb:${item.tmdbId}`
    : `title:${item.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return `${kind}|${identity}`;
}

function groupSeries(items: MediaItem[]): MediaItem[] {
  const output: MediaItem[] = [];
  const groups = new Map<string, MediaItem[]>();

  for (const item of items) {
    if (item.kind === "movie") output.push(item);
    else groups.set(groupKey(item), [...(groups.get(groupKey(item)) ?? []), item]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;

    const episodeItems = group.filter(
      (item) => item.season !== undefined && item.episode !== undefined,
    );

    if (!episodeItems.length) {
      output.push(first);
      continue;
    }

    const seasonsMap = new Map<number, Episode[]>();

    for (const item of episodeItems) {
      const season = item.season!;
      const episode = item.episode!;
      const list = seasonsMap.get(season) ?? [];
      if (list.some((ep) => ep.episode === episode)) continue;

      list.push({
        id: item.id,
        title: `Episode ${episode}`,
        season,
        episode,
        thumb: item.backdrop ?? item.poster,
        mediaUrl: `/api/stream/${encodeURIComponent(item.id)}`,
      });
      seasonsMap.set(season, list);
    }

    const seasons: Season[] = [...seasonsMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([season, episodes]) => ({
        season,
        title: `Season ${season}`,
        episodes: episodes.sort((a, b) => a.episode - b.episode),
        totalEpisodes: episodes.length,
      }));

    const availableEpisodes = seasons.reduce(
      (sum, season) => sum + season.episodes.length,
      0,
    );
    const totalEpisodes = seasons.reduce(
      (sum, season) => sum + (season.totalEpisodes ?? season.episodes.length),
      0,
    );

    output.push({
      ...first,
      season: undefined,
      episode: undefined,
      seasons,
      tag: `${seasons.length} ${seasons.length === 1 ? "Season" : "Seasons"} · ${totalEpisodes} Episodes`,
      progress: availableEpisodes > 0 ? first.progress : undefined,
    });
  }

  return output.sort((a, b) => a.title.localeCompare(b.title));
}

async function getRawLibrary(): Promise<RawItem[]> {
  const now = Date.now();
  if (rawMemoryCache && rawMemoryCache.expiresAt > now) return rawMemoryCache.items;

  const cached = await getCachedDriveLibrary<RawItem[]>();
  if (cached !== null) {
    rawMemoryCache = { items: cached, expiresAt: now + RAW_MEMORY_TTL_MS };
    return cached;
  }

  const fresh = await listDriveLibrary();
  rawMemoryCache = { items: fresh, expiresAt: now + RAW_MEMORY_TTL_MS };
  await setCachedDriveLibrary(fresh);
  return fresh;
}

export async function getLibraryEnrichmentTargets(
  ids: string[],
): Promise<LibraryEnrichmentTarget[]> {
  const requested = new Set(
    ids
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 256),
  );
  if (!requested.size) return [];

  const rawItems = await getRawLibrary();
  return rawItems
    .filter((raw) => requested.has(raw.id))
    .map((raw) => ({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      modifiedTime: raw.modifiedTime,
    }));
}

async function loadLibrary(): Promise<LibraryResponse> {
  const now = Date.now();
  if (libraryMemoryCache && libraryMemoryCache.expiresAt > now) {
    return libraryMemoryCache.value;
  }

  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "google-drive", items: [], count: 0, error: "Google Drive is not configured" };
  }

  try {
    const rawItems = await getRawLibrary();
    const validRaw = rawItems.filter((raw) => raw.id?.trim() && raw.name?.trim());
    const keys = [...new Set(validRaw.map(metadataKeyForRaw))];
    const cached = await getCachedMetadata<CachedMetadata>(keys);

    const normalized = validRaw
      .map((raw) => {
        const item = baseItem(raw);
        if (!item) return null;
        return applyCachedMetadata(item, cached.get(metadataKeyForRaw(raw)) ?? null);
      })
      .filter((item): item is MediaItem => Boolean(item));

    const grouped = groupSeries(normalized);

    const matchedCount = [...cached.values()].filter(
      (value): value is CachedMetadata => Boolean(value && value.status === "matched"),
    ).length;

    console.log(
      `[library] Drive ${validRaw.length} files -> ${grouped.length} entries; metadata ${matchedCount}/${keys.length} cached`,
    );

    const result: LibraryResponse = {
      mode: "google-drive",
      items: grouped,
      count: grouped.length,
    };

    libraryMemoryCache = {
      value: result,
      expiresAt: now + LIBRARY_MEMORY_TTL_MS,
    };

    return result;
  } catch (err) {
    console.error("[library] Google Drive fetch failed", err);
    return {
      mode: "google-drive",
      items: [],
      count: 0,
      error: "Google Drive library unavailable",
    };
  }
}

export async function enrichLibraryBatch(
  targets: LibraryEnrichmentTarget[],
): Promise<LibraryEnrichmentPatch[]> {
  const safeTargets = targets
    .slice(0, 6)
    .filter((target) => target.id.trim() && target.name.trim());

  if (!safeTargets.length) return [];

  const keyByTarget = safeTargets.map(metadataKeyForRaw);
  const keys = [...new Set(keyByTarget)];
  const cached = await getCachedMetadata<CachedMetadata>(keys);
  const computed = new Map<string, Promise<CachedMetadata | null>>();
  let changed = false;

  const compute = (target: LibraryEnrichmentTarget, key: string): Promise<CachedMetadata | null> => {
    const existingPromise = computed.get(key);
    if (existingPromise) return existingPromise;

    const promise = (async (): Promise<CachedMetadata | null> => {
      const existing = cached.get(key);
      if (existing) return existing;

      try {
        const identified = await identifyFilename(target.name);
        const tmdb = identified.tmdb;

        if (tmdb?.mode === "not-configured") {
          return { status: "not-found" };
        }

        if (tmdb?.matched) {
          changed = true;
          return {
            status: "matched",
            title: identified.title,
            year: identified.year,
            kind: identified.kind,
            tmdbId: tmdb.id,
            poster: tmdb.poster,
            backdrop: tmdb.backdrop,
          };
        }

        if (tmdb?.mode === "tmdb") {
          return { status: "not-found" };
        }

        // Unknown TMDB responses are treated as transient rather than
        // persisted. This prevents outages from becoming long-lived misses.
        return null;
      } catch {
        // Do not persist temporary TMDB/network failures for days.
        return null;
      }
    })();

    computed.set(key, promise);
    return promise;
  };

  const uniqueEntries = new Map<string, LibraryEnrichmentTarget>();
  safeTargets.forEach((target, index) => {
    const key = keyByTarget[index];
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, target);
  });

  const computedEntries = await Promise.all(
    [...uniqueEntries.entries()].map(async ([key, target]) => {
      const result = await compute(target, key);
      return [key, result] as const;
    }),
  );

  for (const [key, result] of computedEntries) {
    if (cached.has(key)) continue;

    if (!result) continue;

    if (result.status === "matched") {
      await setCachedMetadata(key, result);
      changed = true;
    } else if (tmdbConfigured()) {
      await setCachedMetadata(key, result, NEGATIVE_METADATA_EXPIRATION_TTL);
    }
  }

  if (changed) libraryMemoryCache = null;

  const patches: LibraryEnrichmentPatch[] = [];
  for (let i = 0; i < safeTargets.length; i += 1) {
    const target = safeTargets[i];
    const key = keyByTarget[i];
    const existing = cached.get(key);
    if (existing) {
      patches.push(toClientPatch(target.id, existing));
      continue;
    }

    const result = await computed.get(key)!;
    patches.push(result ? toClientPatch(target.id, result) : { id: target.id });
  }

  return patches;
}

export function invalidateLibraryCache(): void {
  libraryMemoryCache = null;
}

export async function getLibrary(): Promise<LibraryResponse> {
  return loadLibrary();
}

export async function getPublished(): Promise<MediaItem[]> {
  return (await getLibrary()).items;
}

function findMediaInItems(items: MediaItem[], id: string): MediaItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    for (const season of item.seasons ?? []) {
      const episode = season.episodes.find((ep) => ep.id === id);
      if (episode) return item;
    }
  }
  return undefined;
}

export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  return findMediaInItems(await getPublished(), id);
}
