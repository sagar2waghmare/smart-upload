import { NextResponse } from "next/server";
import { enrichLibraryBatch } from "../../../../lib/library-service";
import { requireSession, unauthorized } from "../../../../lib/auth";
import type { LibraryEnrichmentTarget } from "../../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();

  let body: { targets?: unknown };
  try {
    body = (await req.json()) as { targets?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  if (!Array.isArray(body.targets) || body.targets.length === 0 || body.targets.length > 8) {
    return NextResponse.json({ error: "invalid-batch", message: "Provide 1-8 library targets." }, { status: 400 });
  }

  const targets: LibraryEnrichmentTarget[] = [];
  for (const raw of body.targets) {
    if (!raw || typeof raw !== "object") return NextResponse.json({ error: "invalid-target" }, { status: 400 });
    const value = raw as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const type = value.type;
    if (!id || id.length > 256 || !name || name.length > 512 || !["movie", "series", "anime"].includes(String(type))) {
      return NextResponse.json({ error: "invalid-target" }, { status: 400 });
    }
    targets.push({
      id,
      name,
      type: type as LibraryEnrichmentTarget["type"],
      modifiedTime: typeof value.modifiedTime === "string" ? value.modifiedTime.slice(0, 64) : undefined,
    });
  }

  try {
    const patches = await enrichLibraryBatch(targets);
    return NextResponse.json({ patches }, {
      headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "enrichment-failed" }, { status: 502 });
  }
}
