import type { Metadata } from "next";
import "./globals.css";
import "./player-polish.css";
import "./premium-ui.css";
import "./source-netflix-ui.css";
import "./source-netflix-fixes.css";
import { Header } from "../components/Header";
import { NetflixBottomTabs } from "../components/NetflixBottomTabs";
import { AuthProvider } from "../components/AuthProvider";
import { DetailsProvider } from "../components/DetailsProvider";
import { authIntended, requireSession } from "../lib/auth";
import type { FirebaseClientConfig } from "../lib/firebase-client";

export const metadata: Metadata = {
  title: { default: "Smart Upload", template: "%s · Smart Upload" },
  description: "Private media library.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gate = authIntended() && !(await requireSession());
  const firebaseConfig: FirebaseClientConfig | null =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ? {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
        }
      : null;

  return (
    <html lang="en">
      <body>
        <AuthProvider firebaseConfig={firebaseConfig}>
          <DetailsProvider>
            {gate ? null : <Header />}
            {children}
            {gate ? null : <NetflixBottomTabs />}
          </DetailsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
