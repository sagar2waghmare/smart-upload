import type { AppMode } from "./types";

export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE === "real" ? "real" : "demo";
}

export function isDemoMode(): boolean {
  return getAppMode() === "demo";
}

export function getDemoVideoUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ??
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  );
}

export function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME ?? "Smart Upload";
}

export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
}