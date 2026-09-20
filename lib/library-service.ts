import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import { unstable_cache } from "next/cache";
import { identifyFilename } from "./identify";
import { getEpisodeMeta, tmdbConfigured } from "./metadata/tmdb";
import type { Episode, LibraryResponse, MediaItem, Season } from "./types";

async function normalizeItem(raw: {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  modifiedTime?: string;
  thumbnailLink?: string;
}): Promise<MediaItem | null> {
  const id = raw.id.trim();
  const filename = raw.name.trim();
  if (!id || !filename) return null;

  const fallbackTitle = filename.replace(/\.[^.]+$/, "").trim();
  if (!fallbackTitle) return null;

  const fallbackPoster = `/api/thumbnail/${encodeURIComponent(id)}`;
  const base: MediaItem = {
    id,
    kind: raw.type,
    title: fallbackTitle,
    poster: raw.thumbnailLink?.trim() || fallbackPoster,
    backdrop: raw.thumbnailLink?.trim() || fallbackPoster,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };

  if (!tmdbConfigured()) return base;

  try {
    const identified = await identifyFilename(filename);
    const tmdbId = identified.tmdb?.matched ? identified.tmdb.id : undefined;
    if (identified.tmdb?.matched && identified.tmdb.poster) {
      return {
        ...base,
        title: identified.title || fallbackTitle,
        year: identified.year,
        kind: identified.kind,
        season: identified.season,
        episode: identified.episode,
        tmdbId,
        poster: identified.tmdb.poster,
        backdrop: identified.tmdb.backdrop ?? identified.tmdb.poster,
      };
    }

    return {
      ...base,
      title: identified.title || fallbackTitle,
      year: identified.year,
      kind: identified.kind,
      season: identified.season,
      episode: identified.episode,
      tmdbId,
    };
  } catch {
    return base;
  }
}

function groupKey(item: MediaItem): string {
  const kind = item.kind === "anime" ? "anime" : "series";
  const identity = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return `${kind}|${identity}`;
}

async function groupSeries(items: MediaItem[]): Promise<MediaItem[]> {
  const output: MediaItem[] = [];
  const groups = new Map<string, MediaItem[]>();

  for (const item of items) {
    if (item.kind === "movie") {
      output.push(item);
      continue;
    }
    const key = groupKey(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
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

    if (first.tmdbId) {
      for (const season of seasons) {
        try {
          const meta = await getEpisodeMeta(first.tmdbId, season.season);
          if (!meta) continue;
          season.totalEpisodes = meta.length;
          for (const ep of season.episodes) {
            const found = meta.find((m) => m.episode === ep.episode);
            if (!found) continue;
            ep.title = found.title;
            ep.overview = found.overview;
            ep.runtime = found.runtime;
            ep.thumb = found.thumb ?? ep.thumb;
          }
        } catch {
          // Keep Drive-backed episode data if TMDB episode metadata is unavailable.
        }
      }
    }

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

async function loadLibrary(): Promise<LibraryResponse> {
  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "google-drive", items: [], count: 0, error: "Google Drive is not configured" };
  }
  try {
    const rawItems = await listDriveLibrary();
    const normalized = await Promise.all(rawItems.map(normalizeItem));
    const items = normalized.filter((item): item is MediaItem => item !== null);
    const grouped = await groupSeries(items);
    console.log(`[library] Google Drive returned ${items.length} files as ${grouped.length} library entries`);
    return { mode: "google-drive", items: grouped, count: grouped.length };
  } catch (err) {
    console.error("[library] Google Drive fetch failed", err);
    return { mode: "google-drive", items: [], count: 0, error: err instanceof Error ? err.message : "Google Drive library unavailable" };
  }
}

// Browse tabs all read the same library. Cache the expensive Drive + TMDB normalization
// work briefly so moving between Movies / TV / Anime does not repeat it per request.
export const getLibrary = unstable_cache(loadLibrary, ["smart-upload-library"], {
  revalidate: 30,
  tags: ["library"],
});

export async function getPublished(): Promise<MediaItem[]> {
  return (await getLibrary()).items;
}

export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  return (await getPublished()).find((m) => m.id === id);
}
