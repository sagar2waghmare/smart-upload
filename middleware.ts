import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__session";

export function middleware(req: NextRequest) {
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  if (!authConfigured) return NextResponse.next();

  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isSignInLanding = pathname === "/" && req.nextUrl.searchParams.get("signin") === "1";
  if (isSignInLanding) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("signin", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4|webm)$).*)",
  ],
};