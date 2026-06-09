"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface Item {
  feed: string;
  path: string;
  name: string;
  type: "video" | "image";
  mime: string;
  favorite: boolean;
  src: string;
}

interface Props {
  // Fetches a page of items. Returns items + the next cursor (null when done).
  fetchPage: (cursor: number) => Promise<{ items: Item[]; nextCursor: number | null }>;
  autoplaySetting: boolean;
  title?: string;
}

export default function FeedViewer({ fetchPage, autoplaySetting }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const loadMore = useCallback(async () => {
    if (loading || cursor === null) return;
    setLoading(true);
    try {
      const { items: newItems, nextCursor } = await fetchPage(cursor);
      setItems((prev) => [...prev, ...newItems]);
      setCursor(nextCursor);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, fetchPage]);

  // Initial load.
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load more when the sentinel scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: containerRef.current, rootMargin: "400px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loadMore]);

  // Track which slide is active; play its video, pause the rest.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveIndex(idx);
          }
        }
      },
      { root, threshold: [0, 0.6, 1] }
    );
    const slides = root.querySelectorAll(".slide");
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items.length]);

  // Play active video, pause others.
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === activeIndex) {
        video.muted = muted;
        video.play().catch(() => {});
      } else {
        video.pause();
        if (idx !== activeIndex) video.currentTime = 0;
      }
    });
  }, [activeIndex, muted, items.length]);

  function advance() {
    const root = containerRef.current;
    if (!root) return;
    const next = activeIndex + 1;
    const target = root.querySelector(
      `.slide[data-index="${next}"]`
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  }

  async function toggleFavorite(item: Item, idx: number) {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feed: item.feed, path: item.path }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx ? { ...it, favorite: data.favorite } : it
        )
      );
    }
  }

  return (
    <div className="viewer" ref={containerRef}>
      <button
        className="viewer-back"
        onClick={() => router.back()}
        aria-label="Back"
      >
        ‹
      </button>

      {items.map((item, idx) => (
        <div className="slide" key={`${item.feed}/${item.path}`} data-index={idx}>
          {item.type === "video" ? (
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(idx, el);
                else videoRefs.current.delete(idx);
              }}
              src={item.src}
              playsInline
              loop={!autoplaySetting}
              muted={muted}
              preload={Math.abs(idx - activeIndex) <= 1 ? "auto" : "none"}
              onClick={() => setMuted((m) => !m)}
              onEnded={() => {
                if (autoplaySetting) advance();
              }}
            />
          ) : (
            <img
              src={item.src}
              alt={item.name}
              loading="lazy"
              decoding="async"
            />
          )}

          <div className="slide-actions">
            <button
              className={`action-btn ${item.favorite ? "active" : ""}`}
              onClick={() => toggleFavorite(item, idx)}
              aria-label="Favorite"
            >
              {item.favorite ? "♥" : "♡"}
            </button>
          </div>

          <div className="slide-caption">{item.name}</div>
        </div>
      ))}

      <div className="loading-slide" ref={sentinelRef}>
        {loading
          ? "Loading…"
          : cursor === null && items.length === 0
          ? "Nothing here yet."
          : ""}
      </div>
    </div>
  );
}
