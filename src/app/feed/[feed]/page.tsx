"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import FeedViewer, { Item } from "@/components/FeedViewer";

export default function FeedPage() {
  const params = useParams();
  const feed = decodeURIComponent(
    Array.isArray(params.feed) ? params.feed[0] : (params.feed as string)
  );
  const [autoplay, setAutoplay] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : { autoplay: true }))
      .then((d) => setAutoplay(Boolean(d.autoplay)))
      .catch(() => setAutoplay(true));
  }, []);

  const fetchPage = useCallback(
    async (cursor: number): Promise<{ items: Item[]; nextCursor: number | null }> => {
      const res = await fetch(
        `/api/feeds/${encodeURIComponent(feed)}/items?cursor=${cursor}`
      );
      if (!res.ok) return { items: [], nextCursor: null };
      const data = await res.json();
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [feed]
  );

  if (autoplay === null) return null;

  return <FeedViewer fetchPage={fetchPage} autoplaySetting={autoplay} />;
}
