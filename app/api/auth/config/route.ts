import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function env(name: string): string {
  return process.env[name] ?? "";
}

export async function GET() {
  const config = {
    apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") || undefined,
    messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || undefined,
    appId: env("NEXT_PUBLIC_FIREBASE_APP_ID") || undefined,
  };

  const configured = Boolean(config.apiKey && config.authDomain && config.projectId);

  return NextResponse.json(
    { configured, config: configured ? config : null },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
