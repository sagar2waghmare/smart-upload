"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConfigSnapshot } from "../../lib/types";
import { IArrowLeft, ICloudUpload, IExternal, ISettings } from "../../components/icons";

type HealthSnapshot = ConfigSnapshot & { libraryError?: string };

export default function SettingsPage() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [libraryTitles, setLibraryTitles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const [healthResponse, libraryResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/library", { cache: "no-store" }),
      ]);
      if (!healthResponse.ok) throw new Error(`Health check responded ${healthResponse.status}`);
      if (!libraryResponse.ok) throw new Error(`Library check responded ${libraryResponse.status}`);
      const health = (await healthResponse.json()) as HealthSnapshot;
      const library = (await libraryResponse.json()) as { items?: Array<{ title?: string }> };
      setSnap(health);
      setLibraryTitles((library.items ?? []).slice(0, 8).map((item) => item.title ?? "Untitled"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load integration status");
    }
  };

  useEffect(() => { load(); }, []);

  const rows: { k: string; v: string; tone?: string }[] = snap
    ? [
        { k: "Application", v: `Smart Upload v${snap.version}` },
        { k: "Mode", v: snap.mode === "real" ? "Real API mode" : "Demo mode", tone: snap.mode === "real" ? "pill-ok" : "pill-warn" },
        { k: "Media source", v: snap.mediaSource === "google-drive" ? "Google Drive library" : "Demo library", tone: snap.mediaSource === "google-drive" ? "pill-ok" : "pill-warn" },
        { k: "Uploader", v: snap.uploader === "cloudshell" ? "CloudShell API" : "Not configured", tone: snap.uploader === "cloudshell" ? "pill-ok" : "pill-danger" },
        { k: "Metadata", v: snap.metadata === "tmdb" ? "TMDB service" : "Not configured", tone: snap.metadata === "tmdb" ? "pill-ok" : "pill-warn" },
        { k: "Titles in library", v: `${snap.libraryCount}`, tone: snap.libraryCount > 0 ? "pill-ok" : "pill-warn" },
      ]
    : [];

  return (
    <main className="page">
      <Link href="/" className="back-link"><IArrowLeft /> Home</Link>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Integration status and the server-side services Smart Upload is using.</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "1.6rem" }}>
        <section className="set-card" aria-label="Integration status">
          <h3>Integration status</h3>
          <p className="sub">Re-runs in real time against your server environment. Refresh to re-check.</p>
          <div style={{ marginTop: ".9rem" }}>
            <button className="btn btn-secondary" onClick={load} aria-label="Refresh status"><ISettings /> Refresh</button>
          </div>
          {error && <p style={{ color: "#fecdd3", marginTop: ".8rem", fontSize: ".82rem" }}>{error}</p>}
          {snap && (
            <div style={{ marginTop: ".9rem" }}>
              {rows.map((r) => (
                <div className="var-row" key={r.k}>
                  <span className="k">{r.k}</span>
                  {r.tone ? <span className={`pill ${r.tone}`}>{r.v}</span> : <span className="v">{r.v}</span>}
                </div>
              ))}
              {snap.libraryError && (
                <div className="var-row" style={{ alignItems: "flex-start" }}>
                  <span className="k">Library diagnostic</span>
                  <span className="v" style={{ color: "#fecdd3", maxWidth: "65%" }}>{snap.libraryError}</span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="set-card" aria-label="Library payload">
          <h3>Library payload</h3>
          <p className="sub">This shows whether real media is reaching the UI layer. Only the first eight titles are displayed here.</p>
          <div style={{ marginTop: ".9rem" }}>
            {libraryTitles.length > 0 ? (
              libraryTitles.map((title, index) => <div className="var-row" key={`${title}-${index}`}><span className="k">{index + 1}</span><span className="v">{title}</span></div>)
            ) : (
              <p className="empty-note">No media items were returned by /api/library.</p>
            )}
          </div>
        </section>

        <section className="set-card" aria-label="Server-side configuration">
          <h3>Server-side configuration</h3>
          <p className="sub">Secrets never reach the browser. Google Drive credentials are used only by the Next.js server for library discovery and playback.</p>
          <div style={{ marginTop: ".9rem" }}>
            {[
              ["NEXT_PUBLIC_APP_MODE", "demo | real"],
              ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "Google sign-in (auth enforced when set)"],
              ["ALLOWED_EMAILS", "comma-separated allowed accounts"],
              ["SMART_UPLOAD_DRIVE_MEDIA_ID", "optional Google Drive MEDIA folder ID"],
              ["FIREBASE_SERVICE_ACCOUNT_JSON", "server-side Google/Firebase service account"],
              ["CLOUDSHELL_UPLOAD_URL", "CloudShell upload API receiving { url }"],
              ["CLOUDSHELL_API_KEY", "optional CloudShell secret"],
              ["TMDB_API_KEY", "TMDB metadata service (v3 bearer)"],
            ].map(([k, v]) => <div className="var-row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
          </div>
        </section>

        <section className="set-card" aria-label="Actions">
          <h3>Quick actions</h3>
          <p className="sub">Common paths around the app.</p>
          <div className="details-actions">
            <Link href="/upload" className="btn btn-primary"><ICloudUpload /> Upload URL</Link>
            <a href="/api/health" className="btn btn-secondary"><IExternal /> Health JSON</a>
            <a href="/api/library" className="btn btn-secondary"><IExternal /> Library JSON</a>
          </div>
        </section>
      </div>
    </main>
  );
}
