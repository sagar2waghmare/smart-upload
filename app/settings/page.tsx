"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConfigSnapshot } from "../../lib/types";
import { IArrowLeft, ICloudUpload, IExternal, ISettings } from "../../components/icons";

export default function SettingsPage() {
  const [snap, setSnap] = useState<ConfigSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Health check responded ${r.status}`);
        setSnap((await r.json()) as ConfigSnapshot);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const rows: { k: string; v: string; tone?: string }[] = snap
    ? [
        { k: "Application", v: `Smart Upload v${snap.version}` },
        { k: "Mode", v: snap.mode === "real" ? "Real API mode" : "Demo mode", tone: snap.mode === "real" ? "pill-ok" : "pill-warn" },
        { k: "Media source", v: snap.mediaSource === "aws" ? "AWS library API" : "Demo library", tone: snap.mediaSource === "aws" ? "pill-ok" : "pill-warn" },
        { k: "Uploader", v: snap.uploader === "cloudshell" ? "CloudShell API" : "Not configured", tone: snap.uploader === "cloudshell" ? "pill-ok" : "pill-danger" },
        { k: "Metadata", v: snap.metadata === "tmdb" ? "TMDB service" : "Not configured", tone: snap.metadata === "tmdb" ? "pill-ok" : "pill-warn" },
        { k: "Titles in library", v: `${snap.libraryCount}` },
      ]
    : [];

  return (
    <main className="page">
      <Link href="/" className="back-link"><IArrowLeft /> Home</Link>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Integration status, demo mode, and the environment variables Smart Upload reads server-side.</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "1.6rem" }}>
        <section className="set-card" aria-label="Integration status">
          <h3>Integration status</h3>
          <p className="sub">Re-runs in real time against your server environment. Refresh to re-check.</p>
          <div style={{ marginTop: ".9rem" }}>
            <button className="btn btn-secondary" onClick={() => { setError(null); load(); }} aria-label="Refresh status">
              <ISettings /> Refresh
            </button>
          </div>
          {error && <p style={{ color: "#fecdd3", marginTop: ".8rem", fontSize: ".82rem" }}>{error}</p>}
          {snap && (
            <div style={{ marginTop: ".9rem" }}>
              {rows.map((r) => (
                <div className="var-row" key={r.k}>
                  <span className="k">{r.k}</span>
                  {r.tone && snap ? <span className={`pill ${r.tone}`}>{r.v}</span> : <span className="v">{r.v}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="set-card" aria-label="Required environment variables">
          <h3>Server-side configuration</h3>
          <p className="sub">
            Secrets never reach the browser. These variables are read from the Next.js server and proxied through the app&apos;s API routes.
          </p>
          <div style={{ marginTop: ".9rem" }}>
            {[
              ["NEXT_PUBLIC_APP_MODE", "demo | real"],
              ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "Google sign-in (auth enforced when set)"],
              ["ALLOWED_EMAILS", "comma-separated allowed accounts"],
              ["AWS_LIBRARY_API_URL", "private AWS library/playback API"],
              ["AWS_LIBRARY_API_KEY", "optional bearer/x-api-key secret"],
              ["CLOUDSHELL_UPLOAD_URL", "CloudShell upload API receiving { url }"],
              ["CLOUDSHELL_API_KEY", "optional CloudShell secret"],
              ["TMDB_API_KEY", "TMDB metadata service (v3 bearer)"],
            ].map(([k, v]) => (
              <div className="var-row" key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="set-card" aria-label="Demo mode info">
          <h3>Demo mode</h3>
          <p className="sub">
            Without real endpoints the app runs a clearly-labeled demo: sample media, a public sample video for playback,
            and upload attempts that report <em>not configured</em> instead of faking success.
          </p>
          <ul className="checklist">
            <li>Titles &amp; art from local demo data</li>
            <li>Player streams a public sample video (NEXT_PUBLIC_DEMO_VIDEO_URL)</li>
            <li>Upload URL requires CLOUDSHELL_UPLOAD_URL to return real status</li>
            <li>Filename detection works offline; TMDB match needs TMDB_API_KEY</li>
          </ul>
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