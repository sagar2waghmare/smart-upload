import { env } from "cloudflare:workers";
import { getCachedDriveLibrary, setCachedDriveLibrary } from "./library-cache";
import {
  getDriveFileMetadata,
  getDriveMediaRootId,
  getDriveStartPageToken,
  listDriveChanges,
  listDriveLibrary,
  type DriveChange,
  type DriveIndexFile,
  type DriveLibraryItem,
} from "./google-drive";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run<T = unknown>(): Promise<{ results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
};

type D1Like = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};

type SyncState = {
  cursor: string;
  rootId: string;
  lastSyncAt: number;
};

type IndexedRow = {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  mimeType: string;
  modifiedTime?: string;
};

const db = (): D1Like | null =>
  (env as unknown as { DRIVE_LIBRARY_DB?: D1Like }).DRIVE_LIBRARY_DB ?? null;

const SYNC_INTERVAL_MS = 15_000;
const FOLDER_CACHE_TTL_MS = 10 * 60 * 1000;
const D1_BATCH_SIZE = 50;

let schemaPromise: Promise<void> | null = null;
let syncPromise: Promise<boolean> | null = null;
let lastCheckedAt = 0;
let lastFastPathAt = 0;
const folderMetaCache = new Map<string, { file: DriveIndexFile; expiresAt: number }>();

function videoFile(item: {
  name: string;
  mimeType: string;
}): boolean {
  const ext = item.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const extensions = new Set([
    ".mkv",
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".m4v",
    ".ts",
    ".m2ts",
    ".wmv",
  ]);
  return !item.name.toLowerCase().endsWith(".browser.mp4") &&
    (item.mimeType.startsWith("video/") || extensions.has(ext));
}

function mediaTypeFromCategory(name: string): "movie" | "series" | "anime" {
  const category = name.toLowerCase().replace(/[ _-]/g, "");
  if (["series", "tv", "shows", "tvshows"].includes(category)) return "series";
  if (["anime", "animes"].includes(category)) return "anime";
  return "movie";
}

async function ensureSchema(store: D1Like): Promise<void> {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await store.batch([
      store.prepare(
        `CREATE TABLE IF NOT EXISTS drive_library (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          modified_time TEXT,
          thumbnail_link TEXT
        )`,
      ),
      store.prepare(
        `CREATE INDEX IF NOT EXISTS idx_drive_library_type_name
         ON drive_library(type, name)`,
      ),
      store.prepare(
        `CREATE TABLE IF NOT EXISTS drive_library_sync (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          cursor TEXT NOT NULL,
          root_id TEXT NOT NULL,
          last_sync_at INTEGER NOT NULL DEFAULT 0
        )`,
      ),
    ]);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function insertStatements(store: D1Like, items: DriveLibraryItem[]): D1Statement[] {
  return items.map((item) =>
    store
      .prepare(
        `INSERT INTO drive_library
           (id, name, type, mime_type, size, modified_time, thumbnail_link)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           mime_type = excluded.mime_type,
           size = excluded.size,
           modified_time = excluded.modified_time,
           thumbnail_link = excluded.thumbnail_link`,
      )
      .bind(
        item.id,
        item.name,
        item.type,
        item.mimeType,
        item.size,
        item.modifiedTime ?? null,
        item.thumbnailLink ?? null,
      ),
  );
}

async function writeItems(store: D1Like, items: DriveLibraryItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += D1_BATCH_SIZE) {
    await store.batch(insertStatements(store, items.slice(i, i + D1_BATCH_SIZE)));
  }
}

async function replaceSnapshot(
  store: D1Like,
  items: DriveLibraryItem[],
): Promise<void> {
  await store.batch([store.prepare("DELETE FROM drive_library")]);
  await writeItems(store, items);
}

async function getSyncState(store: D1Like): Promise<SyncState | null> {
  const row = await store
    .prepare(
      "SELECT cursor, root_id as rootId, last_sync_at as lastSyncAt FROM drive_library_sync WHERE id = 1",
    )
    .first<SyncState>();
  return row
    ? {
        cursor: row.cursor,
        rootId: row.rootId,
        lastSyncAt: Number(row.lastSyncAt) || 0,
      }
    : null;
}

async function setSyncState(
  store: D1Like,
  state: SyncState,
): Promise<void> {
  await store
    .prepare(
      `INSERT INTO drive_library_sync (id, cursor, root_id, last_sync_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cursor = excluded.cursor,
         root_id = excluded.root_id,
         last_sync_at = excluded.last_sync_at`,
    )
    .bind(state.cursor, state.rootId, state.lastSyncAt)
    .run();
}

async function getFolderMetadata(id: string): Promise<DriveIndexFile> {
  const cached = folderMetaCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.file;

  const file = await getDriveFileMetadata(id);
  folderMetaCache.set(id, {
    file,
    expiresAt: Date.now() + FOLDER_CACHE_TTL_MS,
  });
  return file;
}

async function classifyChangedFile(
  file: DriveIndexFile,
  rootId: string,
): Promise<DriveLibraryItem | null> {
  const name = file.name?.trim() ?? "";
  const mimeType = file.mimeType ?? "";
  if (!file.id || !name || file.trashed || !videoFile({ name, mimeType })) {
    return null;
  }

  const parents = file.parents ?? [];
  if (!parents.length) return null;

  let currentId = parents[0];
  let categoryName = "";
  const visited = new Set<string>();

  for (let depth = 0; depth < 12; depth += 1) {
    if (!currentId || visited.has(currentId)) return null;
    visited.add(currentId);

    if (currentId === rootId) {
      return {
        id: file.id,
        name,
        type: mediaTypeFromCategory(categoryName),
        path: `MEDIA/${name}`,
        mimeType,
        size: Number(file.size ?? 0) || 0,
        modifiedTime: file.modifiedTime,
        thumbnailLink: file.thumbnailLink,
      };
    }

    const parent = await getFolderMetadata(currentId);
    if (!parent.mimeType?.includes("folder")) return null;

    categoryName = parent.name?.trim() || categoryName;
    currentId = parent.parents?.[0] ?? "";
  }

  return null;
}

async function applyChanges(
  store: D1Like,
  rootId: string,
  changes: DriveChange[],
): Promise<boolean> {
  let folderStructureChanged = false;
  const statements: D1Statement[] = [];

  for (const change of changes) {
    if (change.file?.mimeType?.includes("folder")) {
      folderStructureChanged = true;
      continue;
    }

    if (change.removed) {
      // Drive tombstones contain only the item ID, so we cannot distinguish a
      // deleted/inaccessible video from a deleted/moved folder. Rebuild the
      // snapshot conservatively to avoid leaving stale descendants in D1.
      folderStructureChanged = true;
      continue;
    }

    const file = change.file ?? (await getDriveFileMetadata(change.fileId));
    if (file.mimeType?.includes("folder")) {
      folderStructureChanged = true;
      continue;
    }

    const item = await classifyChangedFile(file, rootId);
    if (!item) {
      statements.push(
        store.prepare("DELETE FROM drive_library WHERE id = ?").bind(change.fileId),
      );
      continue;
    }

    statements.push(
      store
        .prepare(
          `INSERT INTO drive_library
             (id, name, type, mime_type, size, modified_time, thumbnail_link)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             mime_type = excluded.mime_type,
             size = excluded.size,
             modified_time = excluded.modified_time,
             thumbnail_link = excluded.thumbnail_link`,
        )
        .bind(
          item.id,
          item.name,
          item.type,
          item.mimeType,
          item.size,
          item.modifiedTime ?? null,
          item.thumbnailLink ?? null,
        ),
    );
  }

  for (let i = 0; i < statements.length; i += D1_BATCH_SIZE) {
    await store.batch(statements.slice(i, i + D1_BATCH_SIZE));
  }

  return folderStructureChanged;
}

async function readIndexedRows(store: D1Like): Promise<IndexedRow[]> {
  const result = await store
    .prepare(
      "SELECT id, name, type, mime_type as mimeType, modified_time as modifiedTime FROM drive_library ORDER BY type, name",
    )
    .run<IndexedRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    mimeType: row.mimeType,
    modifiedTime: row.modifiedTime,
  }));
}

async function fullRebuild(
  store: D1Like,
  rootId: string,
): Promise<IndexedRow[]> {
  // Capture the cursor before the scan so changes that happen during the
  // rebuild are still visible on the next incremental sync.
  const cursor = await getDriveStartPageToken();
  const snapshot = await listDriveLibrary();
  await replaceSnapshot(store, snapshot);
  await setSyncState(store, {
    cursor,
    rootId,
    lastSyncAt: Date.now(),
  });

  return snapshot.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    mimeType: item.mimeType,
    modifiedTime: item.modifiedTime,
  }));
}

async function syncIndexInternal(store: D1Like): Promise<boolean> {
  await ensureSchema(store);

  const current = await getSyncState(store);
  const rootId = await getDriveMediaRootId();

  if (!current) {
    const initialToken = await getDriveStartPageToken();
    const snapshot = await listDriveLibrary();
    await replaceSnapshot(store, snapshot);
    await setSyncState(store, {
      cursor: initialToken,
      rootId,
      lastSyncAt: Date.now(),
    });
  }

  const state = await getSyncState(store);
  if (!state) return true;

  if (state.rootId !== rootId) {
    await fullRebuild(store, rootId);
    return true;
  }

  let pageToken = state.cursor;
  let latestCursor = state.cursor;
  let rebuild = false;

  while (pageToken) {
    let page;
    try {
      page = await listDriveChanges(pageToken);
    } catch (error) {
      if (String(error).includes("410")) {
        rebuild = true;
        break;
      }
      throw error;
    }

    if (page.changes?.length) {
      const folderChanged = await applyChanges(store, rootId, page.changes);
      rebuild = rebuild || folderChanged;
    }

    if (page.newStartPageToken) latestCursor = page.newStartPageToken;
    pageToken = page.nextPageToken ?? "";
  }

  if (rebuild) {
    await fullRebuild(store, rootId);
    return true;
  }

  const changed = latestCursor !== state.cursor;
  await setSyncState(store, {
    ...state,
    cursor: latestCursor,
    rootId,
    lastSyncAt: Date.now(),
  });

  return changed;
}

export async function syncDriveLibraryIndex(): Promise<boolean> {
  const store = db();
  if (!store) return false;

  const now = Date.now();
  if (now - lastCheckedAt < SYNC_INTERVAL_MS) return false;
  if (syncPromise) return syncPromise;

  lastCheckedAt = now;
  syncPromise = syncIndexInternal(store)
    .catch((error) => {
      console.error(
        "[drive-index] incremental sync failed",
        error instanceof Error ? error.message : "unknown",
      );
      return false;
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

export async function getIndexedDriveLibrary(): Promise<IndexedRow[] | null> {
  const store = db();
  if (!store) return null;

  const cached = await getCachedDriveLibrary<IndexedRow[]>();
  const cachedHasMimeType =
    cached !== null &&
    cached.every((row) => typeof row.mimeType === "string" && row.mimeType.length > 0);

  // Fast path: a valid KV snapshot is already enough to render the library.
  // Do not make the first page request wait for a Google Drive change check.
  if (cachedHasMimeType && Date.now() - lastFastPathAt < 30_000) return cached;
  if (cachedHasMimeType) lastFastPathAt = Date.now();

  try {
    const changed = await syncDriveLibraryIndex();
    // Refresh old KV snapshots created before mimeType became part of the
    // playback index. This keeps playback source selection independent from
    // a stale cache generation.
    if (!changed && cachedHasMimeType) return cached;

    await ensureSchema(store);
    const rows = await readIndexedRows(store);
    await setCachedDriveLibrary(rows, 300);
    return rows;
  } catch (error) {
    console.error(
      "[drive-index] index read failed",
      error instanceof Error ? error.message : "unknown",
    );
    return cached;
  }
}
