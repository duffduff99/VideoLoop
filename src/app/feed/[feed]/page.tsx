"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import FeedViewer, { PageResult } from "@/components/FeedViewer";

export default function FeedPage() {
  const params = useParams();
  const feed = decodeURIComponent(
    Array.isArray(params.feed) ? params.feed[0] : (params.feed as string)
  );
  const [autoplay, setAutoplay] = useState<boolean | null>(null);
  // Base seed for this visit; each loop cycle offsets it for a fresh order.
  const baseSeed = useRef(Math.floor(Math.random() * 1_000_000));

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : { autoplay: true }))
      .then((d) => setAutoplay(Boolean(d.autoplay)))
      .catch(() => setAutoplay(true));
  }, []);

  const fetchPage = useCallback(
    async (cursor: number, cycle: number): Promise<PageResult> => {
      const seed = baseSeed.current + cycle;
      const res = await fetch(
        `/api/feeds/${encodeURIComponent(feed)}/items?cursor=${cursor}&seed=${seed}`
      ).catch(() => null);
      if (!res) return { items: [], nextCursor: null };
      if (!res.ok) return { items: [], nextCursor: null, status: res.status };
      const data = await res.json();
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [feed]
  );

  if (autoplay === null) return <div className="viewer-empty"><div className="spinner" /></div>;

  // Keyed by feed so switching playlists fully resets the viewer's state.
  return <FeedViewer key={feed} title={feed} fetchPage={fetchPage} autoplaySetting={autoplay} />;
}
