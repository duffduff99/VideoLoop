"use client";

import { useEffect, useState, useCallback } from "react";
import FeedViewer, { Item } from "@/components/FeedViewer";

export default function FavoritesPage() {
  const [autoplay, setAutoplay] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : { autoplay: true }))
      .then((d) => setAutoplay(Boolean(d.autoplay)))
      .catch(() => setAutoplay(true));
  }, []);

  // Favorites are returned in a single page.
  const fetchPage = useCallback(
    async (cursor: number): Promise<{ items: Item[]; nextCursor: number | null }> => {
      if (cursor > 0) return { items: [], nextCursor: null };
      const res = await fetch("/api/favorites");
      if (!res.ok) return { items: [], nextCursor: null };
      const data = await res.json();
      return { items: data.items, nextCursor: null };
    },
    []
  );

  if (autoplay === null) return null;

  return <FeedViewer fetchPage={fetchPage} autoplaySetting={autoplay} />;
}
