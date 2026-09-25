import path from "node:path";
import { NextResponse } from "next/server";
import {
  getPreparedHlsEntry,
  readPreparedHlsPlaylist,
} from "../../../../../lib/google-drive-playback";
import {
  cloudflarePlaybackConfigured,
  createCloudflarePlaybackUrl,
} from "../../../../../lib/cloudflare-playback";
import { requireSession, unauthorized } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; path?: string[] }>;
};

function safeRelativePath(value: string): string | null {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || normalized.includes("\0")) {
    return null;
  }
  return normalized;
}

function publicHlsUrl(sourceId: string, relativePath: string): string {
  const encodedId = encodeURIComponent(sourceId);
  const encodedPath = relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/api/hls/${encodedId}/${encodedPath}`;
}

function mediaUrl(fileId: string): string {
  return `/api/stream/${encodeURIComponent(fileId)}`;
}

async function rewritePlaylist(sourceId: string, playlistPath: string, source: string): Promise<string> {
  const lines = source.split(/\\r?\\n/);
  const rewritten: string[] = [];

  for (const line of lines) {
    const replaceUri = async (uri: string) => {
      const cleanUri = uri.split("#", 1)[0].split("?", 1)[0];
      const base = path.posix.dirname(playlistPath);
      const resolved = safeRelativePath(path.posix.join(base, cleanUri));
      if (!resolved) return uri;

      if (resolved.endsWith(".m3u8")) {
        return publicHlsUrl(sourceId, resolved);
      }

      return mediaUrlForPath(sourceId, resolved);
    };

    if (line.startsWith("#")) {
      const matches = [...line.matchAll(/URI="([^"]+)"/g)];
      if (matches.length === 0) {
        rewritten.push(line);
        continue;
      }

      let next = line;
      for (const match of matches.reverse()) {
        const original = match[1];
        const replacement = await replaceUri(original);
        next =
          next.slice(0, match.index! + 5) +
          replacement +
          next.slice(match.index! + 5 + original.length);
      }
      rewritten.push(next);
      continue;
    }

    if (!line.trim()) {
      rewritten.push(line);
      continue;
    }

    const base = path.posix.dirname(playlistPath);
    const resolved = safeRelativePath(path.posix.join(base, line.trim()));
    if (!resolved) {
      rewritten.push(line);
      continue;
    }

    rewritten.push(
      resolved.endsWith(".m3u8")
        ? publicHlsUrl(sourceId, resolved)
        : await mediaUrlForPath(sourceId, resolved),
    );
  }

  return rewritten.join("\n");
}


const entryCache = new Map<string, { url: string; expiresAt: number }>();

async function mediaUrlForPath(sourceId: string, relativePath: string): Promise<string> {
  const key = `${sourceId}:${relativePath}`;
  const cached = entryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const entry = await getPreparedHlsEntry(sourceId, relativePath);
  const url = entry ? mediaUrl(entry.id) : "";
  if (url) entryCache.set(key, { url, expiresAt: Date.now() + 10 * 60 * 1000 });
  return url || publicHlsUrl(sourceId, relativePath);
}

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const { id, path: pathParts = [] } = await params;
  const relativePath = safeRelativePath(pathParts.join("/")) ?? "master.m3u8";

  if (!relativePath.endsWith(".m3u8")) {
    const entry = await getPreparedHlsEntry(id, relativePath);
    if (!entry) return NextResponse.json({ error: "not-found" }, { status: 404 });

    const responseUrl = mediaUrl(entry.id);
    if (responseUrl.startsWith("http")) {
      return NextResponse.redirect(responseUrl, 302);
    }

    return NextResponse.redirect(new URL(responseUrl, _req.url), 302);
  }

  const playlist = await readPreparedHlsPlaylist(id, relativePath);
  if (!playlist) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const body = await rewritePlaylist(id, relativePath, playlist.content);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
