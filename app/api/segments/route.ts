import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

type CreditSegment = {
  start_ms?: number | null;
  end_ms?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  start?: number | null;
  end?: number | null;
};

type TheIntroDbResponse = {
  credits?: CreditSegment[];
};

type LegacyIntroDbResponse = {
  outro?: CreditSegment | CreditSegment[] | null;
};

function asPositiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function creditStart(segment: CreditSegment): number | null {
  const ms = asFiniteNumber(segment.start_ms);
  if (ms !== null) return ms / 1000;
  return asFiniteNumber(segment.start_sec) ?? asFiniteNumber(segment.start);
}

function cacheHeaders(seconds: number): HeadersInit {
  return { "cache-control": `private, max-age=${seconds}, stale-while-revalidate=${seconds * 2}` };
}

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const tmdbId = asPositiveInteger(params.get("tmdbId"));
  const imdbId = params.get("imdbId")?.trim() ?? "";
  const season = asPositiveInteger(params.get("season"));
  const episode = asPositiveInteger(params.get("episode"));
  const duration = Number(params.get("duration"));

  if ((!tmdbId && !/^tt\d{7,10}$/.test(imdbId)) || !season || !episode) {
    return NextResponse.json({ outroStart: null }, { status: 400 });
  }

  const durationOk = Number.isFinite(duration) && duration > 0;

  try {
    // TheIntroDB current API returns end-credit windows in credits[].
    // duration_ms helps match the playback cut when multiple releases exist.
    const url = new URL("https://api.theintrodb.org/v3/media");
    if (tmdbId) url.searchParams.set("tmdb_id", String(tmdbId));
    else url.searchParams.set("imdb_id", imdbId);
    url.searchParams.set("season", String(season));
    url.searchParams.set("episode", String(episode));
    if (durationOk) url.searchParams.set("duration_ms", String(Math.round(duration * 1000)));

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (response.ok) {
      const data = (await response.json()) as TheIntroDbResponse;
      const starts = (data.credits ?? [])
        .map(creditStart)
        .filter((value): value is number => value !== null && value > 0 && (!durationOk || value < duration));
      if (starts.length) {
        return NextResponse.json(
          { outroStart: Math.max(...starts) },
          { headers: cacheHeaders(1800) },
        );
      }
    }

    // Backward-compatible fallback for the older IntroDB.app API.
    if (/^tt\d{7,10}$/.test(imdbId)) {
      const legacy = new URL("https://api.introdb.app/segments");
      legacy.searchParams.set("imdb_id", imdbId);
      legacy.searchParams.set("season", String(season));
      legacy.searchParams.set("episode", String(episode));
      if (durationOk) legacy.searchParams.set("duration", String(duration));

      const legacyResponse = await fetch(legacy, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      });

      if (legacyResponse.ok) {
        const legacyData = (await legacyResponse.json()) as LegacyIntroDbResponse;
        const legacySegments = Array.isArray(legacyData.outro)
          ? legacyData.outro
          : legacyData.outro
            ? [legacyData.outro]
            : [];
        const starts = legacySegments
          .map(creditStart)
          .filter((value): value is number => value !== null && value > 0 && (!durationOk || value < duration));
        if (starts.length) {
          return NextResponse.json(
            { outroStart: Math.max(...starts) },
            { headers: cacheHeaders(1800) },
          );
        }
      }
    }

    return NextResponse.json({ outroStart: null }, { headers: cacheHeaders(600) });
  } catch {
    return NextResponse.json({ outroStart: null }, { headers: cacheHeaders(300) });
  }
}
