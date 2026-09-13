import type { Episode, MediaItem } from "./types";
import { getDemoVideoUrl, isDemoMode } from "./config";

export function resolvePlaybackUrl(configuredUrl?: string): { url: string; demo: boolean; canPlay: boolean } {
  if (configuredUrl) return { url: configuredUrl, demo: false, canPlay: true };
  if (isDemoMode()) return { url: getDemoVideoUrl(), demo: true, canPlay: true };
  return { url: "", demo: false, canPlay: false };
}

export function resolveEpisodeUrl(item: MediaItem, episode?: Episode): { url: string; demo: boolean; canPlay: boolean } {
  const target = episode?.mediaUrl ?? item.mediaUrl;
  const resolved = resolvePlaybackUrl(target);
  return resolved;
}