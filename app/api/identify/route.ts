import { NextResponse } from "next/server";
import { identifyFilename } from "../../../lib/identify";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();
  let body: { filename?: unknown; year?: unknown };
  try {
    body = (await req.json()) as { filename?: unknown; year?: unknown };
  } catch {
    body = {};
  }

  if (typeof body.filename !== "string" || body.filename.trim().length < 3)
    return NextResponse.json({ message: "Provide a media filename to identify." }, { status: 400 });

  const result = await identifyFilename(body.filename, {
    year: typeof body.year === "number" ? body.year : undefined,
  });
  return NextResponse.json(result);
}