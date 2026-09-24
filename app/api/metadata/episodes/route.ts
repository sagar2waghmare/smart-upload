import { NextResponse } from "next/server";
import { getEpisodeMeta, tmdbConfigured } from "../../../../lib/metadata/tmdb";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const tmdbId = Number(params.get("tmdbId"));
  const season = Number(params.get("season"));

  if (
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    tmdbId > 2_000_000_000 ||
    !Number.isInteger(season) ||
    season < 1 ||
    season > 100
  ) {
    return NextResponse.json({ matched: false, error: "invalid-season" }, { status: 400 });
  }

  if (!tmdbConfigured()) {
    return NextResponse.json(
      { matched: false, mode: "not-configured", episodes: [] },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  }

  try {
    const episodes = await getEpisodeMeta(tmdbId, season);
    return NextResponse.json(
      { matched: Boolean(episodes?.length), mode: "tmdb", episodes: episodes ?? [] },
      {
        headers: {
          "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { matched: false, mode: "error", episodes: [] },
      { status: 502, headers: { "cache-control": "private, no-store" } },
    );
  }
}
