import fs from "fs/promises";
import path from "path";
import type { SessionPayload } from "./session";
import { prisma } from "./db";

export const MEDIA_ROOT = process.env.MEDIA_ROOT || "/media";

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export type MediaType = "video" | "image";

export interface MediaItem {
  feed: string;
  path: string; // path relative to the feed folder
  name: string;
  type: MediaType;
  mime: string;
}

export interface FeedInfo {
  name: string;
  private: boolean;
}

export function mediaType(ext: string): MediaType | null {
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function mimeFor(ext: string): string {
  return MIME[ext.toLowerCase()] || "application/octet-stream";
}

// ---- Feed definitions ----
// Feeds live in the database and are managed in the app (Settings -> Manage
// feeds), so adding a folder never needs a redeploy. The FEEDS /
// PRIVATE_FEEDS environment variables are only used once, to import the
// initial list the first time the app starts with an empty feed table.

export interface FeedDef {
  id: string;
  name: string; // display name (also the URL/feed key)
  rel: string; // folder path relative to MEDIA_ROOT
  private: boolean;
}

// Names marked private by the (import-only) environment variables.
function envPrivateNames(): Set<string> {
  const set = new Set<string>();
  for (const name of (process.env.PRIVATE_FEEDS || "").split(/[,\n]/)) {
    if (name.trim()) set.add(name.trim().toLowerCase());
  }
  // Legacy "Name:password" list: those feeds are treated as private.
  for (const entry of (process.env.FEED_PASSWORDS || "").split(/[,\n]/)) {
    const idx = entry.indexOf(":");
    const name = (idx === -1 ? entry : entry.slice(0, idx)).trim();
    if (name) set.add(name.toLowerCase());
  }
  return set;
}

function envFeeds(): { name: string; rel: string }[] {
  return (process.env.FEEDS || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx === -1) return { name: entry, rel: entry };
      return { name: entry.slice(0, idx).trim(), rel: entry.slice(idx + 1).trim() };
    })
    .filter((d) => d.name && d.rel);
}

// Normalize a folder path relative to MEDIA_ROOT ("" is the root itself).
// Returns null if it would escape the root.
export function normalizeRel(rel: string): string | null {
  const root = path.resolve(MEDIA_ROOT);
  const abs = path.resolve(root, rel.replace(/\\/g, "/").replace(/^\/+/, ""));
  const out = path.relative(root, abs);
  if (out.startsWith("..") || path.isAbsolute(out)) return null;
  return out.split(path.sep).join("/");
}

export async function listSubfolders(rel: string): Promise<string[] | null> {
  const norm = normalizeRel(rel);
  if (norm === null) return null;
  try {
    const entries = await fs.readdir(path.resolve(MEDIA_ROOT, norm), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return null;
  }
}

const INIT_KEY = "feedsInitialized";

// One-time import of the feeds an older (env-configured) install was showing.
async function importInitialFeeds(): Promise<void> {
  const done = await prisma.setting.findUnique({ where: { key: INIT_KEY } });
  if (done) return;
  if ((await prisma.feed.count()) === 0) {
    let defs = envFeeds();
    if (defs.length === 0) {
      // No FEEDS: every top-level folder under MEDIA_ROOT was a feed.
      defs = ((await listSubfolders("")) || []).map((n) => ({ name: n, rel: n }));
    }
    const privateNames = envPrivateNames();
    const legacyKey = (n: string) => "FEED_PASSWORD_" + n.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const seen = new Set<string>();
    for (const d of defs) {
      const rel = normalizeRel(d.rel);
      if (!rel || seen.has(d.name)) continue;
      seen.add(d.name);
      await prisma.feed.create({
        data: {
          name: d.name,
          path: rel,
          isPrivate: privateNames.has(d.name.toLowerCase()) || Boolean(process.env[legacyKey(d.name)]),
        },
      });
    }
    // Nothing mounted yet? Try again next time rather than starting empty.
    if (defs.length === 0) return;
  }
  await prisma.setting.upsert({
    where: { key: INIT_KEY },
    update: {},
    create: { key: INIT_KEY, value: new Date().toISOString() },
  });
}

// Cached in memory: this is consulted on every media request.
let defsCache: Promise<FeedDef[]> | null = null;
const listingCache = new Map<string, { at: number; items: Promise<MediaItem[]> }>();

// Call after any change to the Feed table.
export function invalidateFeeds(): void {
  defsCache = null;
  listingCache.clear();
}

export function getFeedDefs(): Promise<FeedDef[]> {
  if (!defsCache) {
    const p = (async () => {
      await importInitialFeeds();
      const rows = await prisma.feed.findMany();
      return rows
        .map((r) => ({ id: r.id, name: r.name, rel: r.path, private: r.isPrivate }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    })();
    defsCache = p;
    p.catch(() => {
      if (defsCache === p) defsCache = null;
    });
  }
  return defsCache;
}

export async function getFeed(name: string): Promise<FeedDef | null> {
  return (await getFeedDefs()).find((d) => d.name === name) || null;
}

// ---- Private feeds ----
// Private feeds are hidden everywhere (feed list, items, media, favorites)
// until the user re-enters their own account password in Settings.

// How long private feeds stay visible after unlocking (default 12 hours).
export function privateUnlockMs(): number {
  const hours = parseFloat(process.env.PRIVATE_UNLOCK_HOURS || "12");
  return (isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
}

export function privateVisible(session: SessionPayload): boolean {
  return (session.privateUntil ?? 0) > Date.now();
}

// Whether this session may see a feed (and its items, media and favorites).
// Unknown feeds are not viewable.
export async function canViewFeed(session: SessionPayload, feed: string): Promise<boolean> {
  const def = await getFeed(feed);
  if (!def) return false;
  return !def.private || privateVisible(session);
}

// Resolve a feed name to its absolute base directory, validated to stay within
// MEDIA_ROOT. Returns null for unknown feeds or paths that escape the root.
export async function feedDir(feedName: string): Promise<string | null> {
  const def = await getFeed(feedName);
  if (!def) return null;
  const rel = normalizeRel(def.rel);
  if (!rel) return null;
  return path.resolve(MEDIA_ROOT, rel);
}

// List the feeds.
export async function listFeeds(): Promise<FeedInfo[]> {
  return (await getFeedDefs()).map((d) => ({ name: d.name, private: d.private }));
}

// Resolve a feed + relative path to an absolute path, guarding against
// directory traversal outside the feed's base folder.
export async function resolveMediaPath(
  feed: string,
  relPath: string
): Promise<string | null> {
  const base = await feedDir(feed);
  if (!base) return null;
  const target = path.resolve(base, relPath);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return target;
}

// How long a feed's file listing is reused before the share is re-read. Walking
// a big folder over SMB is slow, and the viewer asks for a page every few
// swipes; new files still show up within a minute.
const LISTING_TTL_MS = 60 * 1000;

// Recursively collect media items within a feed (cached briefly), sorted by
// path. Callers must not mutate the returned array.
export function listFeedItems(feed: string): Promise<MediaItem[]> {
  const hit = listingCache.get(feed);
  if (hit && Date.now() - hit.at < LISTING_TTL_MS) return hit.items;
  const items = walkFeed(feed);
  const entry = { at: Date.now(), items };
  listingCache.set(feed, entry);
  items.catch(() => {
    if (listingCache.get(feed) === entry) listingCache.delete(feed);
  });
  return items;
}

async function walkFeed(feed: string): Promise<MediaItem[]> {
  const resolved = await feedDir(feed);
  if (!resolved) return [];
  const feedRoot: string = resolved;

  const items: MediaItem[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        subdirs.push(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const type = mediaType(ext);
        if (!type) continue;
        items.push({
          feed,
          path: path.relative(feedRoot, abs).split(path.sep).join("/"),
          name: entry.name,
          type,
          mime: mimeFor(ext),
        });
      }
    }
    await Promise.all(subdirs.map(walk));
  }

  await walk(feedRoot);
  items.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return items;
}
