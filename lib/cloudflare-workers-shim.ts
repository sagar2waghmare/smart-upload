/**
 * Build-time compatibility shim for Vinext/Next builds.
 *
 * Vinext generates an internal cloudflare:workers export-types module that
 * expects the standard Cloudflare Workers runtime exports to exist. The app
 * itself only needs env at build/runtime on the Node-compatible side, so keep
 * these classes intentionally minimal here.
 */
export const env = process.env as Record<string, string | undefined>;

export class WorkerEntrypoint {
  ctx: unknown;
  env: Record<string, unknown>;

  constructor(ctx?: unknown, env?: Record<string, unknown>) {
    this.ctx = ctx;
    this.env = env ?? {};
  }
}

export class DurableObject {
  ctx: unknown;
  env: Record<string, unknown>;

  constructor(ctx?: unknown, env?: Record<string, unknown>) {
    this.ctx = ctx;
    this.env = env ?? {};
  }
}

export class WorkflowEntrypoint {
  ctx: unknown;
  env: Record<string, unknown>;

  constructor(ctx?: unknown, env?: Record<string, unknown>) {
    this.ctx = ctx;
    this.env = env ?? {};
  }
}
