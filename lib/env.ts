export function getEnv<T extends Record<string, string | undefined>>(
  keys: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};

  if (typeof process !== "undefined" && process.env) {
    for (const key of keys) {
      const value = process.env[key as string];
      if (value !== undefined) result[key] = value;
    }
  }

  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    const cfEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
    if (cfEnv) {
      for (const key of keys) {
        const value = cfEnv[key as string];
        if (value !== undefined) result[key] = value;
      }
    }
  }

  return result;
}

export function getEnvValue(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[key];
    if (value !== undefined) return value;
  }

  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    const cfEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
    if (cfEnv) {
      return cfEnv[key];
    }
  }

  return undefined;
}