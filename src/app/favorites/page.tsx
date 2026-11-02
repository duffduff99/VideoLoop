"use client";

import { useCallback, useEffect, useState } from "react";
import FeedViewer, { PageResult } from "@/components/FeedViewer";

export default function FavoritesPage() {
  const [autoplay, setAutoplay] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : { autoplay: true }))
      .then((d) => setAutoplay(Boolean(d.autoplay)))
      .catch(() => setAutoplay(true));
  }, []);

  // Favorites come back in one page; looping replays them.
  const fetchPage = useCallback(async (cursor: number): Promise<PageResult> => {
    if (cursor > 0) return { items: [], nextCursor: null };
    const res = await fetch("/api/favorites").catch(() => null);
    if (!res) return { items: [], nextCursor: null };
    if (!res.ok) return { items: [], nextCursor: null, status: res.status };
    const data = await res.json();
    return { items: data.items, nextCursor: null };
  }, []);

  if (autoplay === null) return <div className="viewer-empty"><div className="spinner" /></div>;

  return <FeedViewer title="Favorites" fetchPage={fetchPage} autoplaySetting={autoplay} />;
}
