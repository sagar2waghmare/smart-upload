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

export const metadata: Metadata = {
  title: { default: "Smart Upload", template: "%s · Smart Upload" },
  description: "Private media library.",
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
            {gate ? null : <NetflixBottomTabs />}
          </DetailsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
