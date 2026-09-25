import { NextResponse } from "next/server";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

type Segment = {
  start_sec?: number;
  end_sec?: number;
  start?: number;
  end?: number;
};

type IntroDbResponse = {
  outro?: Segment | null;
};

function asPositiveInteger(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFiniteSeconds(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const imdbId = params.get("imdbId")?.trim() ?? "";
  const season = asPositiveInteger(params.get("season"));
  const episode = asPositiveInteger(params.get("episode"));
  const duration = Number(params.get("duration"));

  if (!/^tt\d{7,10}$/.test(imdbId) || !season || !episode) {
    return NextResponse.json({ outroStart: null }, { status: 400 });
  }

  const url = new URL("https://api.introdb.app/segments");
  url.searchParams.set("imdb_id", imdbId);
  url.searchParams.set("season", String(season));
  url.searchParams.set("episode", String(episode));
  if (Number.isFinite(duration) && duration > 0) {
    url.searchParams.set("duration", String(duration));
  }

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) {
      return NextResponse.json({ outroStart: null }, { status: 200 });
    }

    const data = (await response.json()) as IntroDbResponse;
    const outro = data.outro;
    if (!outro) {
      return NextResponse.json({ outroStart: null }, { status: 200 });
    }

    const outroStart =
      asFiniteSeconds(outro.start_sec) ??
      asFiniteSeconds(outro.start);

    return NextResponse.json(
      { outroStart },
      { headers: { "cache-control": "private, max-age=1800, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ outroStart: null }, { status: 200 });
  }
}
