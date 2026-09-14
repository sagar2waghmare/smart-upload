export type MediaKind = "movie" | "series" | "anime";

export interface Episode {
  id: string;
  title: string;
  overview?: string;
  season: number;
  episode: number;
  runtime?: number;
  thumb?: string;
  mediaUrl?: string;
}

export interface Season {
  season: number;
  title?: string;
  episodes: Episode[];
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  year?: string | number;
  overview?: string;
  runtime?: number;
  rating?: number;
  genres?: string[];
  poster?: string;
  backdrop?: string;
  tag?: string;
  tagStyle?: "new" | "demo" | "4k" | string;
  progress?: number;
  mediaUrl?: string;
  seasons?: Season[];
  hasSubtitles?: boolean;
  source?: string;
}

export interface LibraryResponse {
  mode: "demo" | "google-drive";
  items: MediaItem[];
  count: number;
  error?: string;
}

export type UploadStatus =
  | "idle"
  | "validating"
  | "submitting"
  | "queued"
  | "success"
  | "failed"
  | "not-configured";

export interface UploadResult {
  status: UploadStatus;
  message: string;
  details?: {
    filename?: string;
    kind?: MediaKind;
    season?: number;
    episode?: number;
    destinationUrl?: string;
  };
}

export interface IdentifyPayload {
  filename: string;
}

export interface IdentifyResult {
  raw: string;
  normalizedTitle: string;
  title: string;
  year?: number;
  kind: MediaKind;
  season?: number;
  episode?: number;
  resolution?: string;
  group?: string;
  confidence: number;
  tmdb?: {
    matched: boolean;
    id?: number;
    mode: "tmdb" | "demo" | "not-configured" | "error";
    title?: string;
    poster?: string;
    backdrop?: string;
  };
  source: string;
}

export type AppMode = "demo" | "real";

export interface ConfigSnapshot {
  mode: AppMode;
  mediaSource: "google-drive" | "demo";
  uploader: "cloudshell" | "demo" | "none";
  metadata: "tmdb" | "none";
  libraryCount: number;
  version: string;
}