import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import {
  resolveMediaPath,
  mimeFor,
  canViewFeed,
} from "@/lib/feeds";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Largest response to an open-ended range request (see below).
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

// Stop reading from the share as soon as the browser cancels the request
// (e.g. the user swiped away), instead of streaming to nobody.
function abortWith(req: NextRequest, stream: NodeJS.ReadableStream & { destroy(): void }) {
  if (req.signal.aborted) stream.destroy();
  else req.signal.addEventListener("abort", () => stream.destroy(), { once: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { feed: string; path: string[] } }
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const feed = decodeURIComponent(params.feed);
  if (!canViewFeed(session, feed)) {
    return new Response("Not found", { status: 403 });
  }

  const relPath = params.path.map((p) => decodeURIComponent(p)).join("/");
  const abs = await resolveMediaPath(feed, relPath);
  if (!abs) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const mime = mimeFor(path.extname(abs));
  const total = stat.size;
  const range = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && (match[1] || match[2])) {
      let start: number;
      let end: number;
      if (!match[1]) {
        // Suffix range "bytes=-N": the last N bytes (used to read an index
        // stored at the end of the file, e.g. MP4s without "faststart").
        const suffix = parseInt(match[2], 10);
        start = Math.max(0, total - suffix);
        end = total - 1;
      } else {
        start = parseInt(match[1], 10);
        // Clamp to the file size (an end past EOF is valid per RFC 9110).
        end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        // Open-ended request ("bytes=N-"): answer with a bounded chunk. The
        // browser asks for the rest as it needs it. Unbounded responses keep
        // a connection busy per preloaded video, and browsers only allow ~6
        // per server, so the video you swipe to can be left waiting at 0:00.
        if (!match[2]) end = Math.min(end, start + MAX_CHUNK_BYTES - 1);
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(abs, { start, end });
      abortWith(req, nodeStream);
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": chunkSize.toString(),
        },
      });
    }
  }

  const nodeStream = createReadStream(abs);
  abortWith(req, nodeStream);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": total.toString() },
  });
}
