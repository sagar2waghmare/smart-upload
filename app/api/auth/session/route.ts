import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionCookie,
  firebaseAdminConfigured,
  revokeRefreshTokens,
  verifyIdToken,
  verifySessionCookie,
} from "../../../../lib/firebase-admin";
import {
  isAllowedEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SESSION_OPTIONS,
} from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!firebaseAdminConfigured())
    return NextResponse.json({ authenticated: false, configured: false });
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionCookie(token) : null;
  return NextResponse.json({
    authenticated: Boolean(user),
    configured: true,
    email: user?.email ?? null,
  });
}

export async function POST(req: Request) {
  if (!firebaseAdminConfigured())
    return NextResponse.json(
      { error: "not-configured", message: "Sign-in is not configured." },
      { status: 503 }
    );

  let body: { idToken?: unknown };
  try {
    body = (await req.json()) as { idToken?: unknown };
  } catch {
    body = {};
  }

  const idToken = typeof body.idToken === "string" && body.idToken.length > 10 ? body.idToken : "";
  if (!idToken)
    return NextResponse.json(
      { error: "invalid-request", message: "Missing idToken." },
      { status: 400 }
    );

  const user = await verifyIdToken(idToken);
  if (!user || !user.email)
    return NextResponse.json({ error: "unauthorized", message: "Could not verify sign-in." }, { status: 401 });

  if (!isAllowedEmail(user.email))
    return NextResponse.json(
      { error: "forbidden", message: "This account is not on the allowed list for Smart Upload." },
      { status: 403 }
    );

  const session = await createSessionCookie(idToken, SESSION_MAX_AGE_SECONDS * 1000);
  if (!session)
    return NextResponse.json({ error: "unauthorized", message: "Could not create session." }, { status: 401 });

  const store = await cookies();
  store.set(SESSION_COOKIE, session, SESSION_OPTIONS);
  return NextResponse.json({ ok: true, email: user.email });
}

export async function DELETE() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await verifySessionCookie(token);
    if (user) {
      // Revoke the underlying Firebase session server-side; failures are
      // swallowed (helper catches) so the cookie is still cleared below.
      // Firebase errors/truncated details are never surfaced to the client.
      await revokeRefreshTokens(user.uid);
    }
  }
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}