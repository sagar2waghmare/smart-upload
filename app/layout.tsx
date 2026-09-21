import type { Metadata } from "next";
import "./globals.css";
import "./abyss-theme.css";
import "./cinematic-polish.css";
import "./ui-motion.css";
import "./player-polish.css";
import "./premium-ui.css";
import "./player-mobile-fixes.css";
import { Header } from "../components/Header";
import { AuthProvider } from "../components/AuthProvider";
import { DetailsProvider } from "../components/DetailsProvider";
import { authIntended, requireSession } from "../lib/auth";
import { getAppName, getAppVersion } from "../lib/config";
import { ICloudUpload } from "../components/icons";

export const metadata: Metadata = {
  title: { default: "Smart Upload — Private Media Library", template: "%s · Smart Upload" },
  description: "Your private media library. Upload, organize and watch movies, TV and anime.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gate = authIntended() && !(await requireSession());
  const firebaseConfig =
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
            {gate ? null : (
              <footer className="site-footer">
                <span className="foot-brand">
                  <span className="brand-mark" style={{ width: "1.7em", height: "1.7em", fontSize: ".9rem" }}>S</span>
                  {getAppName()}
                </span>
                <span>Private media library · v{getAppVersion()}</span>
                <a href="/upload" style={{ display: "inline-flex", alignItems: "center", gap: ".35em", color: "var(--laranja)" }}>
                  <ICloudUpload /> Upload a URL
                </a>
              </footer>
            )}
          </DetailsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}