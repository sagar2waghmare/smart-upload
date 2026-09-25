import { NextResponse } from "next/server";
import { identifyFilename } from "../../../lib/identify";
import { getTmdbById, searchTmdb, tmdbConfigured } from "../../../lib/metadata/tmdb";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());

  if (sp.filename) {
    const result = await identifyFilename(sp.filename, { year: Number(sp.year) || undefined });
    return NextResponse.json(result);
  }

  const tmdbId = Number(asString(sp.tmdbId));
  if (Number.isFinite(tmdbId) && tmdbId > 0) {
    if (!tmdbConfigured()) {
      return NextResponse.json(
        { matched: false, mode: "not-configured", message: "Set TMDB_API_KEY to enable metadata." },
        { status: 200 },
      );
    }
    try {
      const type = asString(sp.type);
      const kind = type === "movie" ? "movie" : type === "anime" ? "anime" : "series";
      const result = await getTmdbById(tmdbId, kind);
      if (!result) return NextResponse.json({ matched: false, mode: "tmdb" }, { headers: { "cache-control": "private, max-age=3600, stale-while-revalidate=86400" } });
      return NextResponse.json(
        { matched: true, mode: "tmdb", tmdbType: result.tmdbType, meta: result.meta },
        { headers: { "cache-control": "private, max-age=86400, stale-while-revalidate=604800" } },
      );
    } catch {
      return NextResponse.json({ matched: false, mode: "error", message: "TMDB request failed." }, { status: 502 });
    }
  }

  const query = (asString(sp.query) ?? "").trim();
  if (!query) return NextResponse.json({ message: "Provide ?query= to look up metadata." }, { status: 400 });

  if (!tmdbConfigured()) {
    return NextResponse.json(
      { matched: false, mode: "not-configured", message: "Set TMDB_API_KEY to enable metadata." },
      { status: 200 }
    );
  }

  try {
    const result = await searchTmdb(query, {
      year: Number(asString(sp.year)) || undefined,
      kind:
        asString(sp.type) === "movie"
          ? "movie"
          : asString(sp.type) === "series" || asString(sp.type) === "anime"
            ? "series"
            : undefined,
    });
    if (!result) return NextResponse.json({ matched: false, mode: "tmdb" }, { headers: { "cache-control": "private, max-age=3600, stale-while-revalidate=86400" } });
    return NextResponse.json({ matched: true, mode: "tmdb", tmdbType: result.tmdbType, meta: result.meta }, { headers: { "cache-control": "private, max-age=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ matched: false, mode: "error", message: "TMDB request failed." }, { status: 502 });
  }
}