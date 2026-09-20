import type { UploadResult } from "./types";

const CLOUDSHELL_UPLOAD_URL = process.env.CLOUDSHELL_UPLOAD_URL;
const CLOUDSHELL_API_SECRET = process.env.CLOUDSHELL_API_SECRET;
const ALLOW_DEMO_UPLOAD = process.env.ALLOW_DEMO_UPLOAD === "true";

export function cloudShellConfigured(): boolean {
  return Boolean(CLOUDSHELL_UPLOAD_URL && CLOUDSHELL_API_SECRET);
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
  ok?: boolean;
  status?: string;
  message?: string;
  filename?: string;
  job_id?: string;
  position?: number;
  error?: string;
}

export async function cloudShellUpload(url: string): Promise<UploadResult> {
  if (!cloudShellConfigured()) {
    if (ALLOW_DEMO_UPLOAD) {
      return {
        status: "queued",
        message:
          "Demo upload accepted — no real upload was performed. Configure CLOUDSHELL_UPLOAD_URL and CLOUDSHELL_API_SECRET for a real upload.",
        details: { filename: "demo-file.mkv" },
      };
    }
    return {
      status: "not-configured",
      message:
        "Upload API is not configured. Set CLOUDSHELL_UPLOAD_URL and CLOUDSHELL_API_SECRET in the server environment, then try again.",
    };
  }

  try {
    const res = await fetch(CLOUDSHELL_UPLOAD_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        Authorization: `Bearer ${CLOUDSHELL_API_SECRET}`,
      },
      body: JSON.stringify({ url, type: "auto" }),
      cache: "no-store",
    });

    let data: CloudShellResponse = {};
    try {
      data = (await res.json()) as CloudShellResponse;
    } catch {
      /* non-JSON response */
    }

    if (res.ok) {
      return {
        status: "queued",
        message: data.job_id
          ? `Upload accepted and queued (job ${data.job_id}).`
          : data.message ?? "Upload accepted and queued by the CloudShell pipeline.",
        details: { filename: data.filename },
      };
    }

    return {
      status: "failed",
      message: data.error ?? data.message ?? `Upload API responded ${res.status}.`,
    };
  } catch (err) {
    return {
      status: "failed",
      message:
        err instanceof Error
          ? `Could not reach the upload API: ${err.message}`
          : "Could not reach the upload API.",
    };
  }
}
