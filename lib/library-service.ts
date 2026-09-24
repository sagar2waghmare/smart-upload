import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import { identifyFilename } from "./identify";
import { parseFilename } from "./media/detect";
import { getCachedDriveLibrary, setCachedDriveLibrary, getCachedMetadata, metadataCacheKey, setCachedMetadata } from "./library-cache";
import type { Episode, LibraryEnrichmentPatch, LibraryEnrichmentTarget, LibraryResponse, MediaItem, Season } from "./types";

type RawItem = {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  modifiedTime?: string;
  thumbnailLink?: string;
};

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
    poster: raw.thumbnailLink?.trim() || `/api/thumbnail/${encodeURIComponent(id)}`,
    backdrop: raw.thumbnailLink?.trim() || `/api/thumbnail/${encodeURIComponent(id)}`,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };
}

function applyPatch(item: MediaItem, patch?: LibraryEnrichmentPatch | null): MediaItem {
  if (!patch || patch.id !== item.id) return item;
  return {
    ...item,
    title: patch.title || item.title,
    year: patch.year ?? item.year,
    kind: patch.kind ?? item.kind,
    season: item.kind === "movie" ? undefined : patch.season ?? item.season,
    episode: item.kind === "movie" ? undefined : patch.episode ?? item.episode,
    tmdbId: patch.tmdbId ?? item.tmdbId,
    poster: patch.poster || item.poster,
    backdrop: patch.backdrop || item.backdrop,
    overview: patch.overview ?? item.overview,
    runtime: patch.runtime ?? item.runtime,
    rating: patch.rating ?? item.rating,
    genres: patch.genres ?? item.genres,
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
    const episodeItems = group.filter((item) => item.season !== undefined && item.episode !== undefined);

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

    const availableEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
    const totalEpisodes = seasons.reduce((sum, season) => sum + (season.totalEpisodes ?? season.episodes.length), 0);
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
  const cached = await getCachedDriveLibrary<RawItem[]>();
  if (cached?.length) return cached;
  const fresh = await listDriveLibrary();
  if (fresh.length) await setCachedDriveLibrary(fresh);
  return fresh;
}

async function loadLibrary(): Promise<LibraryResponse> {
  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "google-drive", items: [], count: 0, error: "Google Drive is not configured" };
  }

  try {
    const rawItems = await getRawLibrary();
    const validRaw = rawItems.filter((raw) => raw.id?.trim() && raw.name?.trim());
    const targets: LibraryEnrichmentTarget[] = validRaw.map((raw) => ({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      modifiedTime: raw.modifiedTime,
    }));

    const keys = validRaw.map((raw) => metadataCacheKey(raw.id, raw.modifiedTime));
    const cached = await getCachedMetadata<LibraryEnrichmentPatch>(keys);
    const normalized = validRaw
      .map((raw, index) => applyPatch(baseItem(raw)!, cached.get(keys[index]) ?? null))
      .filter(Boolean);

    const grouped = groupSeries(normalized);
    const pending = validRaw.filter((raw) => !cached.get(metadataCacheKey(raw.id, raw.modifiedTime)));
    const pendingTargets: LibraryEnrichmentTarget[] = pending.map((raw) => ({
      id: raw.id,
      name: raw.name,
      type: raw.type,
      modifiedTime: raw.modifiedTime,
    }));

    console.log(`[library] Drive returned ${validRaw.length} files as ${grouped.length} entries; ${pendingTargets.length} need metadata`);

    return {
      mode: "google-drive",
      items: grouped,
      count: grouped.length,
      enrichmentTargets: pendingTargets.length ? pendingTargets : undefined,
    };
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

export async function enrichLibraryBatch(targets: LibraryEnrichmentTarget[]): Promise<LibraryEnrichmentPatch[]> {
  const safeTargets = targets.slice(0, 8);
  const keys = safeTargets.map((target) => metadataCacheKey(target.id, target.modifiedTime));
  const cached = await getCachedMetadata<LibraryEnrichmentPatch>(keys);
  const patches: LibraryEnrichmentPatch[] = [];

  for (let i = 0; i < safeTargets.length; i += 1) {
    const target = safeTargets[i];
    const key = keys[i];
    const existing = cached.get(key);
    if (existing) {
      patches.push(existing);
      continue;
    }

    try {
      const identified = await identifyFilename(target.name);
      const tmdb = identified.tmdb;
      const patch: LibraryEnrichmentPatch = {
        id: target.id,
        title: identified.title,
        year: identified.year,
        kind: identified.kind,
        season: target.type === "movie" ? undefined : identified.season,
        episode: target.type === "movie" ? undefined : identified.episode,
        tmdbId: tmdb?.matched ? tmdb.id : undefined,
        poster: tmdb?.matched ? tmdb.poster : undefined,
        backdrop: tmdb?.matched ? tmdb.backdrop : undefined,
      };
      await setCachedMetadata(key, patch);
      patches.push(patch);
    } catch {
      const patch: LibraryEnrichmentPatch = { id: target.id };
      await (await import("./library-cache")).setCachedMetadata(key, patch);
      patches.push(patch);
    }
  }

  return patches;
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
