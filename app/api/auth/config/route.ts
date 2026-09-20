import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? undefined,
  };

  const configured = Boolean(config.apiKey && config.authDomain && config.projectId);

  return NextResponse.json(
    {
      configured,
      config: configured ? config : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
