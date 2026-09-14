import { NextResponse } from "next/server";
import type { ConfigSnapshot } from "../../../lib/types";
import { getAppMode, getAppVersion } from "../../../lib/config";
import { getLibrary } from "../../../lib/library-service";
import { googleDriveConfigured } from "../../../lib/google-drive";
import { cloudShellConfigured } from "../../../lib/cloudshell";
import { tmdbConfigured } from "../../../lib/metadata/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  const lib = await getLibrary();
  const snapshot: ConfigSnapshot & { libraryError?: string } = {
    mode: getAppMode(),
    version: getAppVersion(),
    mediaSource: googleDriveConfigured() ? "google-drive" : "demo",
    uploader: cloudShellConfigured() ? "cloudshell" : "none",
    metadata: tmdbConfigured() ? "tmdb" : "none",
    libraryCount: lib.count,
    ...(lib.error ? { libraryError: lib.error } : {}),
  };
  return NextResponse.json(snapshot);
}
