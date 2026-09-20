const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface Env {
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  PLAYBACK_SECRET: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

type CloudflareCacheStorage = CacheStorage & { default: Cache };
const edgeCache = (globalThis.caches as CloudflareCacheStorage).default;

let currentExecutionContext: WorkerExecutionContext | null = null;

let cachedToken: { token: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;
let verifyKeyPromise: Promise<CryptoKey> | null = null;

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error("Invalid base64url value");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  return base64UrlBytes(body);
}

// Web Crypto's TypeScript definitions can require an ArrayBuffer with a
// concrete ArrayBuffer backing store. Make an owned copy to avoid the
// Uint8Array<ArrayBufferLike> vs BufferSource type mismatch.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function serviceAccount(env: Env): ServiceAccount {
  const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error("Invalid Google service account secret");
  return parsed;
}

async function accessToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const sa = serviceAccount(env);
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
    const claim = base64UrlJson({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: TOKEN_URL, iat: now, exp: now + 3600 });
    const unsigned = header + "." + claim;
    const key = await crypto.subtle.importKey("pkcs8", toArrayBuffer(pemToBytes(sa.private_key)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const assertion = unsigned + "." + sig;
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
    const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) throw new Error("Google token exchange failed (" + response.status + ")");
    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("Google token response had no access token");
    cachedToken = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
    return data.access_token;
  })();
  try { return await tokenPromise; } finally { tokenPromise = null; }
}

async function verifySignature(fileId: string, expires: string, signature: string, env: Env): Promise<boolean> {
  try {
    const exp = Number(expires);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(exp) || exp <= now || exp > now + 15 * 60) return false;
    if (!verifyKeyPromise) {
      verifyKeyPromise = crypto.subtle.importKey("raw", toArrayBuffer(new TextEncoder().encode(env.PLAYBACK_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    }
    const key = await verifyKeyPromise;
    return crypto.subtle.verify("HMAC", key, toArrayBuffer(base64UrlBytes(signature)), new TextEncoder().encode(fileId + ":" + expires));
  } catch {
    return false;
  }
}

function corsHeaders(origin = "*"): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Range, If-Range, If-None-Match, If-Modified-Since");
  h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Type");
  return h;
}

function copyMediaHeaders(upstream: Response, headers: Headers) {
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
}


const RANGE_CHUNK_BYTES = 8 * 1024 * 1024;

type ByteRange = { start: number; end: number | null };

type StoredChunk = {
  start: number;
  end: number;
  total: number;
};

function parseSingleRange(value: string | null): ByteRange | null {
  if (!value) return null;
  const match = /^bytes=([0-9]+)-([0-9]*)$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(start) || start < 0) return null;
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) return null;
  return { start, end };
}

function parseContentRange(value: string | null): StoredChunk | null {
  const match = /^bytes ([0-9]+)-([0-9]+)\\/([0-9]+)$/.exec(value ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= end
  ) return null;
  return { start, end, total };
}

function chunkCacheKey(requestUrl: URL, fileId: string, chunkStart: number): Request {
  return new Request(
    `${requestUrl.origin}/__smart-upload-range-cache/${encodeURIComponent(fileId)}/${chunkStart}`,
  );
}

function sliceBody(
  body: ReadableStream<Uint8Array>,
  skipBytes: number,
  takeBytes: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let skip = skipBytes;
  let remaining = takeBytes;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (remaining <= 0) {
        try { await reader.cancel(); } catch {}
        controller.close();
        return;
      }

      while (remaining > 0) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        let chunk = value;
        if (skip > 0) {
          const skipped = Math.min(skip, chunk.byteLength);
          skip -= skipped;
          chunk = chunk.subarray(skipped);
        }

        if (chunk.byteLength === 0) continue;

        const take = Math.min(remaining, chunk.byteLength);
        controller.enqueue(chunk.subarray(0, take));
        remaining -= take;

        if (remaining <= 0) {
          try { await reader.cancel(); } catch {}
          controller.close();
          return;
        }
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch {}
    },
  });
}

function rangeResponse(
  body: ReadableStream<Uint8Array>,
  stored: StoredChunk,
  range: ByteRange,
  cacheState: "HIT" | "MISS",
  mediaHeaders: Headers,
): Response | null {
  const requestedEnd = range.end ?? stored.end;
  const responseEnd = Math.min(requestedEnd, stored.end, stored.total - 1);
  if (range.start < stored.start || responseEnd < range.start) return null;

  const length = responseEnd - range.start + 1;
  const headers = new Headers();
  for (const name of ["content-type", "etag", "last-modified"]) {
    const value = mediaHeaders.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Length", String(length));
  headers.set("Content-Range", `bytes ${range.start}-${responseEnd}/${stored.total}`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=60, must-revalidate");
  headers.set("X-Smart-Range-Cache", cacheState);
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(
    sliceBody(body, range.start - stored.start, length),
    { status: 206, headers },
  );
}

async function serveRangedChunk(
  request: Request,
  ctx: WorkerExecutionContext,
  fileId: string,
  range: ByteRange,
  token: string,
): Promise<Response | null> {
  const chunkStart = Math.floor(range.start / RANGE_CHUNK_BYTES) * RANGE_CHUNK_BYTES;
  const cacheKey = chunkCacheKey(new URL(request.url), fileId, chunkStart);
  const cached = await edgeCache.match(cacheKey);

  if (cached) {
    const startValue = Number(cached.headers.get("X-Smart-Range-Start"));
    const endValue = Number(cached.headers.get("X-Smart-Range-End"));
    const totalValue = Number(cached.headers.get("X-Smart-Range-Total"));
    const stored: StoredChunk = { start: startValue, end: endValue, total: totalValue };

    if (
      Number.isSafeInteger(stored.start) &&
      Number.isSafeInteger(stored.end) &&
      Number.isSafeInteger(stored.total) &&
      stored.start >= 0 &&
      stored.end >= stored.start &&
      stored.total > stored.end
    ) {
      const response = rangeResponse(
        cached.body as ReadableStream<Uint8Array>,
        stored,
        range,
        "HIT",
        cached.headers,
      );
      if (response) return response;
    }
  }

  const chunkEnd = chunkStart + RANGE_CHUNK_BYTES - 1;
  const headers = new Headers();
  headers.set("Range", `bytes=${chunkStart}-${chunkEnd}`);
  headers.set("Authorization", "Bearer " + token);
  headers.set("Accept-Encoding", "identity");

  const upstream = await fetch(
    DRIVE_API + "/" + encodeURIComponent(fileId) + "?alt=media",
    { headers },
  );

  if (upstream.status !== 206 || !upstream.body) return null;
  const stored = parseContentRange(upstream.headers.get("content-range"));
  if (!stored || stored.start !== chunkStart) return null;

  const mediaHeaders = new Headers();
  for (const name of ["content-type", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) mediaHeaders.set(name, value);
  }

  const contentLength = stored.end - stored.start + 1;
  const [clientBody, cacheBody] = upstream.body.tee();

  const cacheHeaders = new Headers(mediaHeaders);
  cacheHeaders.set("Content-Length", String(contentLength));
  cacheHeaders.set("Cache-Control", "public, max-age=3600");
  cacheHeaders.set("X-Smart-Range-Start", String(stored.start));
  cacheHeaders.set("X-Smart-Range-End", String(stored.end));
  cacheHeaders.set("X-Smart-Range-Total", String(stored.total));

  // Cache API cannot store 206 responses. Store this fixed chunk as an internal
  // 200 response, then slice it back to the browser's requested range.
  ctx.waitUntil(
    edgeCache.put(cacheKey, new Response(cacheBody, { status: 200, headers: cacheHeaders })),
  );

  return rangeResponse(clientBody, stored, range, "MISS", mediaHeaders);
}

async function driveMediaFetch(url: string, headers: Headers): Promise<Response> {
  return fetch(url, { headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    currentExecutionContext = ctx;
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin") ?? "*") });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: corsHeaders() });

    let fileId = "";
    try {
      fileId = decodeURIComponent(url.pathname.replace(/^\/+/, "").split("/")[0] ?? "").trim();
    } catch {
      return new Response("Bad request", { status: 400, headers: corsHeaders(request.headers.get("Origin") ?? "*") });
    }
    const expires = url.searchParams.get("e") ?? "";
    const signature = url.searchParams.get("s") ?? "";
    if (!fileId || !/^[A-Za-z0-9_-]{10,256}$/.test(fileId) || !expires || !signature || signature.length > 128 || !(await verifySignature(fileId, expires, signature, env))) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders(request.headers.get("Origin") ?? "*") });
    }

    try {
      const token = await accessToken(env);
      const rangeHeader = request.headers.get("Range");
      const range = parseSingleRange(rangeHeader);

      if (range) {
        const cachedRange = await serveRangedChunk(request, currentExecutionContext ?? { waitUntil(promise) { void promise; } }, fileId, range, token);
        if (cachedRange) {
          cachedRange.headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") ?? "*");
          cachedRange.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          cachedRange.headers.set("Access-Control-Allow-Headers", "Range, If-Range, If-None-Match, If-Modified-Since");
          cachedRange.headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Type, X-Smart-Range-Cache");
          return cachedRange;
        }
      }

      const headers = new Headers();
      if (rangeHeader) headers.set("Range", rangeHeader);
      for (const name of ["If-Range", "If-None-Match", "If-Modified-Since"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("Authorization", "Bearer " + token);
      headers.set("Accept-Encoding", "identity");

      let upstream = await driveMediaFetch(DRIVE_API + "/" + encodeURIComponent(fileId) + "?alt=media", headers);
      if (upstream.status === 401) {
        cachedToken = null;
        token = await accessToken(env);
        headers.set("Authorization", "Bearer " + token);
        upstream = await driveMediaFetch(DRIVE_API + "/" + encodeURIComponent(fileId) + "?alt=media", headers);
      }

      if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304 && upstream.status !== 416) {
        return new Response("Google Drive playback unavailable", { status: upstream.status, headers: corsHeaders(request.headers.get("Origin") ?? "*") });
      }

      const out = new Headers(corsHeaders(request.headers.get("Origin") ?? "*"));
      copyMediaHeaders(upstream, out);
      const originCacheStatus = upstream.headers.get("CF-Cache-Status");
      if (originCacheStatus) out.set("X-Smart-Origin-Cache", originCacheStatus);
      out.set("Cache-Control", "private, max-age=60, must-revalidate");
      out.set("Accept-Ranges", "bytes");
      out.set("X-Content-Type-Options", "nosniff");
      out.set("X-Frame-Options", "DENY");
      out.set("Referrer-Policy", "no-referrer");
      out.set("Cross-Origin-Resource-Policy", "cross-origin");
      out.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
    } catch (error) {
      console.error("[smart-upload-stream] playback failed", error);
      return new Response("Streaming unavailable", { status: 502, headers: corsHeaders(request.headers.get("Origin") ?? "*") });
    }
  },
};
