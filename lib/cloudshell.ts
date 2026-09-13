import type { UploadResult } from "./types";

const CLOUDSHELL_UPLOAD_URL = process.env.CLOUDSHELL_UPLOAD_URL;
const CLOUDSHELL_API_KEY = process.env.CLOUDSHELL_API_KEY;
const CLOUDSHELL_API_KEY_HEADER = process.env.CLOUDSHELL_API_KEY_HEADER ?? "x-api-key";
const ALLOW_DEMO_UPLOAD = process.env.ALLOW_DEMO_UPLOAD === "true";

export function cloudShellConfigured(): boolean {
  return Boolean(CLOUDSHELL_UPLOAD_URL);
}

export function normalizeUrl(raw: string): string | null {
  try {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.hostname.length === 0) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface CloudShellResponse {
  ok: boolean;
  status?: string;
  message?: string;
  filename?: string;
}

export async function cloudShellUpload(url: string): Promise<UploadResult> {
  if (!cloudShellConfigured()) {
    if (ALLOW_DEMO_UPLOAD) {
      return {
        status: "queued",
        message: "Demo upload accepted — no real upload was performed. Configure CLOUDSHELL_UPLOAD_URL for a real upload.",
        details: { filename: "demo-file.mkv" },
      };
    }
    return {
      status: "not-configured",
      message:
        "Upload API is not configured. Set CLOUDSHELL_UPLOAD_URL (and optionally CLOUDSHELL_API_KEY) in your server environment, then try again.",
    };
  }

  try {
    const res = await fetch(CLOUDSHELL_UPLOAD_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(CLOUDSHELL_API_KEY ? { [CLOUDSHELL_API_KEY_HEADER]: CLOUDSHELL_API_KEY } : {}),
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });

    let data: Partial<CloudShellResponse> = {};
    try {
      data = (await res.json()) as Partial<CloudShellResponse>;
    } catch {
      /* non-JSON response */
    }

    if (res.ok || res.status === 202) {
      const q = (data.status ?? "").toLowerCase();
      if (q === "success" || q === "done" || q === "uploaded" || q === "completed") {
        return { status: "success", message: data.message ?? "Upload completed.", details: { filename: data.filename } };
      }
      return { status: "queued", message: data.message ?? "Upload accepted and queued by the CloudShell pipeline.", details: { filename: data.filename } };
    }

    return {
      status: "failed",
      message: data.message ?? `Upload API responded ${res.status}.`,
    };
  } catch (err) {
    return {
      status: "failed",
      message: err instanceof Error ? `Could not reach the upload API: ${err.message}` : "Could not reach the upload API.",
    };
  }
}