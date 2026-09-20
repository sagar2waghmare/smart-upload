import type { Metadata } from "next";
import "./globals.css";
import "./abyss-theme.css";
import "./cinematic-polish.css";
import "./ui-motion.css";
import "./player-polish.css";
import "./premium-ui.css";
import "./netflix-inspired.css";
import "./netflix-clone-ui.css";
import { Header } from "../components/Header";
import { AuthProvider } from "../components/AuthProvider";
import { DetailsProvider } from "../components/DetailsProvider";
import { authIntended, requireSession } from "../lib/auth";

export const metadata: Metadata = {
  title: { default: "Smart Upload — Private Media Library", template: "%s · Smart Upload" },
  description: "Your private media library. Upload, organize and watch movies, TV and anime.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gate = authIntended() && !(await requireSession());

  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <DetailsProvider>
            {gate ? null : <Header />}
            {children}
          </DetailsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
