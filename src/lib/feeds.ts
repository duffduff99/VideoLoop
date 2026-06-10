import fs from "fs/promises";
import path from "path";

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
  size: number;
  mtime: number;
}

export interface FeedInfo {
  name: string;
  locked: boolean;
}

export function mediaType(ext: string): MediaType | null {
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function mimeFor(ext: string): string {
  return MIME[ext.toLowerCase()] || "application/octet-stream";
}

// Convert a feed (folder) name into the env var suffix used for its password.
function feedEnvKey(feed: string): string {
  return "FEED_PASSWORD_" + feed.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function feedPassword(feed: string): string | undefined {
  return process.env[feedEnvKey(feed)];
}

export function isFeedLocked(feed: string): boolean {
  return Boolean(feedPassword(feed));
}

interface FeedDef {
  name: string; // display name (also the URL/feed key)
  rel: string; // folder path relative to MEDIA_ROOT
}

// Optional explicit feed configuration via the FEEDS env var. Format is a
// comma- or newline-separated list of "Display Name:relative/path" entries,
// where the path is relative to MEDIA_ROOT. This lets a feed point at a
// specific subfolder (e.g. "Short Films:main/ShortFilms") instead of a whole
// top-level folder. If a single bare value is given (no colon), the name and
// path are the same. When FEEDS is unset, every top-level folder under
// MEDIA_ROOT is auto-discovered as a feed.
function configuredFeeds(): FeedDef[] | null {
  const raw = process.env.FEEDS;
  if (!raw || !raw.trim()) return null;
  const defs = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx === -1) return { name: entry, rel: entry };
      return {
        name: entry.slice(0, idx).trim(),
        rel: entry.slice(idx + 1).trim(),
      };
    })
    .filter((d) => d.name && d.rel);
  return defs.length ? defs : null;
}

async function getFeedDefs(): Promise<FeedDef[]> {
  const configured = configuredFeeds();
  if (configured) return configured;
  // Auto-discover: every top-level directory under MEDIA_ROOT is a feed.
  let entries;
  try {
    entries = await fs.readdir(MEDIA_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, rel: e.name }));
}

// Resolve a feed name to its absolute base directory, validated to stay within
// MEDIA_ROOT. Returns null for unknown feeds or paths that escape the root.
export async function feedDir(feedName: string): Promise<string | null> {
  const defs = await getFeedDefs();
  const def = defs.find((d) => d.name === feedName);
  if (!def) return null;
  const root = path.resolve(MEDIA_ROOT);
  const dir = path.resolve(root, def.rel);
  const rel = path.relative(root, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    return null;
  }
  return dir;
}

// List the configured (or auto-discovered) feeds.
export async function listFeeds(): Promise<FeedInfo[]> {
  const defs = await getFeedDefs();
  return defs
    .map((d) => ({ name: d.name, locked: isFeedLocked(d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

// Recursively collect media items within a feed.
export async function listFeedItems(feed: string): Promise<MediaItem[]> {
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
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const type = mediaType(ext);
        if (!type) continue;
        let stat;
        try {
          stat = await fs.stat(abs);
        } catch {
          continue;
        }
        items.push({
          feed,
          path: path.relative(feedRoot, abs).split(path.sep).join("/"),
          name: entry.name,
          type,
          mime: mimeFor(ext),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
  }

  await walk(feedRoot);
  // Newest first.
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}
