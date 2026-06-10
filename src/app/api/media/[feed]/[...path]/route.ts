import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import {
  resolveMediaPath,
  mimeFor,
  isFeedLocked,
} from "@/lib/feeds";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { feed: string; path: string[] } }
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const feed = decodeURIComponent(params.feed);
  if (isFeedLocked(feed) && !(session.unlocked || []).includes(feed)) {
    return new Response("Feed locked", { status: 403 });
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
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= total) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(abs, { start, end });
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
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": total.toString() },
  });
}
