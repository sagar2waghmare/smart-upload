import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

export function middleware(req: NextRequest) {
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  const response = NextResponse.next();
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "SAMEORIGIN");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");

  if (!authConfigured) return response;

  if (req.cookies.has(SESSION_COOKIE)) return response;

  const { pathname } = req.nextUrl;
  // The home page renders the full-screen sign-in gate itself when the visitor
  // is unauthenticated, so "/" (and "/?signin=1") pass through to the page.
  if (pathname === "/") return response;

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("signin", "1");
  const redirect = NextResponse.redirect(url);
  for (const [key, value] of response.headers) redirect.headers.set(key, value);
  return redirect;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4|webm)$).*)",
  ],
};