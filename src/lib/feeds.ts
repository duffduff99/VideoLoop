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

// List top-level folders under MEDIA_ROOT as feeds.
export async function listFeeds(): Promise<FeedInfo[]> {
  let entries;
  try {
    entries = await fs.readdir(MEDIA_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, locked: isFeedLocked(e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Resolve a feed + relative path to an absolute path, guarding against
// directory traversal outside the feed folder.
export function resolveMediaPath(feed: string, relPath: string): string | null {
  const root = path.resolve(MEDIA_ROOT);
  const feedRoot = path.resolve(root, feed);
  // Feed name itself must not escape MEDIA_ROOT and must be a single segment.
  const feedRel = path.relative(root, feedRoot);
  if (feedRel.startsWith("..") || feedRel.includes(path.sep) || feedRel === "") {
    return null;
  }
  const target = path.resolve(feedRoot, relPath);
  const rel = path.relative(feedRoot, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return target;
}

// Recursively collect media items within a feed.
export async function listFeedItems(feed: string): Promise<MediaItem[]> {
  const resolved = resolveMediaPath(feed, ".");
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
