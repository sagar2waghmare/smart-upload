import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

const guardedRoutes = ["/my-media", "/favorites", "/upload", "/settings", "/play"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guarded = guardedRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!guarded) return NextResponse.next();

  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  if (!authConfigured) return NextResponse.next();

  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("signin", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4|webm)$).*)",
  ],
};