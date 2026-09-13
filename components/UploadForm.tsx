"use client";
import { useEffect, useRef, useState } from "react";
import type { IdentifyResult, UploadResult, UploadStatus } from "../lib/types";
import { IAlert, ICheck, IClock, ICloudUpload, ILink } from "./icons";

function filenameFromUrl(raw: string): string {
  try {
    const path = new URL(raw.trim()).pathname;
    const seg = path.split("/").filter(Boolean).pop();
    return decodeURIComponent(seg ?? "");
  } catch {
    return raw.trim().split(/[\\/]/).pop() ?? raw.trim();
  }
}

const pipeline = [
  "Detect & download media from the URL",
  "Detect filename → movie / TV / anime",
  "Extract show · season · episode",
  "Route to the correct Google Drive folder",
  "Upload, verify, then queue into the library",
];

export function UploadForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detect, setDetect] = useState<IdentifyResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filename = filenameFromUrl(url);
  const looksLikeFilename = url.trim() !== "" && /[^/]+\.[a-z0-9]{2,4}$/i.test(filename);

  useEffect(() => {
    if (!looksLikeFilename) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const name = filenameFromUrl(url);
      setDetect(null);
      setDetecting(true);
      fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: name }),
      })
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as IdentifyResult;
        })
        .then(setDetect)
        .catch(() => setDetect(null))
        .finally(() => setDetecting(false));
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [looksLikeFilename, url]);

  const valid = (() => {
    try {
      const u = new URL(url.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setStatus("validating");
    setResult(null);
    try {
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = (await res.json()) as UploadResult;
      setStatus(json.status);
      setResult(json);
    } catch (e) {
      setStatus("failed");
      setResult({ status: "failed", message: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setSubmitting(false);
    }
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setUrl("");
    setStatus("idle");
    setResult(null);
    setDetect(null);
    inputRef.current?.focus();
  };

  const statusIcon = () => {
    if (status === "success") return <ICheck />;
    if (status === "queued") return <IClock />;
    if (status === "failed" || status === "not-configured") return <IAlert />;
    return <ICheck />;
  };
  const statusTone =
    status === "success" ? "pill-ok" : status === "queued" ? "pill-warn" : status === "failed" || status === "not-configured" ? "pill-danger" : "pill-neutral";

  return (
    <section className="form-card" aria-label="Upload a URL">
      <div className="eyebrow">PRIVATE LIBRARY</div>
      <h1>Upload a URL</h1>
      <p className="form-sub">
        Smart Upload fetches your media, detects whether it is a movie or show, routes it into the right library
        folder and queues it for playback.
      </p>

      <div className="field">
        <label htmlFor="upload-url">Media URL</label>
        <div className="input-wrap">
          <ILink />
          <input
            ref={inputRef}
            id="upload-url"
            className="text-input"
            type="url"
            inputMode="url"
            placeholder="https://…/Movie.Name.2025.1080p.mkv"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setStatus("idle");
              setResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !submitting) void submit();
            }}
            aria-describedby="upload-hint"
          />
          <button
            className="btn-icon"
            aria-label="Paste from clipboard"
            title="Paste"
            onClick={() => void navigator.clipboard?.readText().then(setUrl).catch(() => undefined)}
          >
            <ICloudUpload />
          </button>
        </div>
        <p className="form-note" id="upload-hint">
          <ILink /> Only http(s) URLs are accepted. Credentials stay on the server — never in your browser.
        </p>
      </div>

      {looksLikeFilename && (
        <div className="detect-grid reveal" aria-live="polite">
          <div className="dg">Detected filename<b>{filename}</b></div>
          {detecting ? (
            <div className="dg" style={{ gridColumn: "1 / -1" }}>
              <span className="status-row"><span className="spinner" /> Querying metadata…</span>
            </div>
          ) : detect ? (
            <>
              <div className="dg">Title<b>{detect.title}</b></div>
              <div className="dg">Type<b>{detect.kind === "series" ? "TV / Series" : detect.kind === "anime" ? "Anime" : "Movie"}</b></div>
              <div className="dg">Season / Episode<b>{detect.season != null ? `S${String(detect.season).padStart(2, "0")} · E${String(detect.episode ?? "?").padStart(2, "0")}` : "—"}</b></div>
              <div className="dg">Year<b>{detect.year ?? "—"}</b></div>
              <div className="dg">Confidence<b>{Math.round(detect.confidence * 100)}%</b></div>
              <div className="dg">
                Metadata
                <b>{detect.tmdb?.matched ? `${detect.tmdb.title} (TMDB)` : detect.tmdb?.mode === "not-configured" ? "TMDB not configured" : "No exact match"}</b>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={!valid || submitting} onClick={() => void submit()} aria-label="Start upload">
          <ICloudUpload /> {submitting ? "Submitting…" : "Upload URL"}
        </button>
        {url && <button className="btn btn-ghost" onClick={clear}>Clear</button>}
      </div>

      {status !== "idle" && (
        <div className="upload-status reveal" aria-live="polite">
          {status === "submitting" || status === "validating" ? (
            <div className="status-row"><span className="spinner" /> Sending to the upload API…</div>
          ) : (
            <div className="status-row">
              <span style={{ color: status === "success" ? "var(--ok)" : status === "failed" || status === "not-configured" ? "var(--danger)" : "var(--warn)", width: "1.15em", height: "1.15em", flex: "none" }}>
                {statusIcon()}
              </span>
              <div>
                <span className={`pill ${statusTone}`} style={{ marginRight: ".5em", textTransform: "capitalize" }}>
                  {status.replace("-", " ")}
                </span>
                {result?.message}
              </div>
            </div>
          )}
          {status === "queued" && result?.details?.filename && (
            <div className="upload-progress">
              <span style={{ width: "55%" }} />
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.8rem", borderTop: "1px dashed var(--border)", paddingTop: "1.2rem" }}>
        <p style={{ margin: 0, fontSize: ".74rem", fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>
          CLOUDSHELL PIPELINE
        </p>
        <ul className="checklist">
          {pipeline.map((step) => (
            <li key={step}><ICheck /> {step}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}