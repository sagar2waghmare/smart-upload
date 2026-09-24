import { NextResponse } from "next/server";
import { getLibrary } from "../../../lib/library-service";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireSession();
  if (!user) return unauthorized();
  const lib = await getLibrary();
  return NextResponse.json(lib, {
    headers: {
      "cache-control": "private, max-age=15, stale-while-revalidate=60",
      "x-content-type-options": "nosniff",
    },
  });
}