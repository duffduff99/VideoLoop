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
  // Fetches a page of items for a given cycle (used to re-randomize on loop).
  // Returns items + the next cursor (null when the cycle is exhausted).
  fetchPage: (
    cursor: number,
    cycle: number
  ) => Promise<{ items: Item[]; nextCursor: number | null }>;
  autoplaySetting: boolean;
}

export default function FeedViewer({ fetchPage, autoplaySetting }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  // Refs to avoid stale closures inside the IntersectionObserver callback.
  const cursorRef = useRef<number | null>(0);
  const cycleRef = useRef(0);
  const itemsLenRef = useRef(0);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      let c = cursorRef.current;
      let cyc = cycleRef.current;
      // Reached the end of a cycle: loop forever by starting a fresh cycle
      // (re-randomized server-side) — but only once we actually have content.
      if (c === null) {
        if (itemsLenRef.current === 0) return;
        cyc = cycleRef.current + 1;
        cycleRef.current = cyc;
        c = 0;
      }
      const { items: newItems, nextCursor } = await fetchPage(c, cyc);
      cursorRef.current = nextCursor;
      if (newItems.length > 0) {
        setItems((prev) => {
          const next = [...prev, ...newItems];
          itemsLenRef.current = next.length;
          return next;
        });
      } else {
        // Empty result — stop to avoid an infinite no-op loop.
        cursorRef.current = null;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchPage]);

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
      { root: containerRef.current, rootMargin: "600px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loadMore]);

  // Track which slide is active.
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

  // Play the active video (pause the rest). If the browser blocks unmuted
  // autoplay, fall back to muted playback and reflect that in the icon.
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === activeIndex) {
        video.muted = muted;
        video.play().catch(() => {
          if (!video.muted) {
            video.muted = true;
            setMuted(true);
            video.play().catch(() => {});
          }
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [activeIndex, muted, items.length]);

  function advance() {
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector(
      `.slide[data-index="${activeIndex + 1}"]`
    ) as HTMLElement | null;
    if (target) target.scrollIntoView({ behavior: "smooth" });
  }

  async function toggleFavorite(item: Item, idx: number) {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feed: item.feed, path: item.path }),
    });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, favorite: data.favorite } : it))
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

      {/* Global mute toggle (applies to all videos). */}
      <button
        className="viewer-mute"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {items.map((item, idx) => (
        <div className="slide" key={idx} data-index={idx}>
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
            <img src={item.src} alt={item.name} loading="lazy" decoding="async" />
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
        {loading ? "Loading…" : items.length === 0 ? "Nothing here yet." : ""}
      </div>
    </div>
  );
}
