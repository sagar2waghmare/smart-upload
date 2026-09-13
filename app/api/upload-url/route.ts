import { NextResponse } from "next/server";
import { cloudShellUpload, normalizeUrl } from "../../../lib/cloudshell";
import { requireSession, unauthorized } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return unauthorized();
  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    body = {};
  }

  const raw = typeof body.url === "string" ? body.url : "";
  const url = normalizeUrl(raw);

  if (!url)
    return NextResponse.json(
      { status: "failed", message: "Enter a valid http(s) URL to upload." },
      { status: 400 }
    );

  const result = await cloudShellUpload(url);
  const http = result.status === "failed" ? 500 : 200;
  return NextResponse.json(result, { status: http });
}