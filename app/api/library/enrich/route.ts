import { NextResponse } from "next/server";
import { enrichLibraryBatch, getLibraryEnrichmentTargets } from "../../../../lib/library-service";
import { requireSession, unauthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 6) {
    return NextResponse.json(
      { error: "invalid-batch", message: "Provide 1-6 library ids." },
      { status: 400 },
    );
  }

  const ids: string[] = [];
  for (const raw of body.ids) {
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "invalid-id" }, { status: 400 });
    }
    const id = raw.trim();
    if (!id || id.length > 256) {
      return NextResponse.json({ error: "invalid-id" }, { status: 400 });
    }
    if (!ids.includes(id)) ids.push(id);
  }

  try {
    // Resolve file names/types server-side. The browser never gets to choose
    // arbitrary TMDB search strings or Google Drive metadata.
    const targets = await getLibraryEnrichmentTargets(ids);
    if (!targets.length) {
      return NextResponse.json(
        { patches: [] },
        { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } },
      );
    }

    const patches = await enrichLibraryBatch(targets);
    return NextResponse.json(
      { patches },
      { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } },
    );
  } catch {
    return NextResponse.json({ error: "enrichment-failed" }, { status: 502 });
  }
}
