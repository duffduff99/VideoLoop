"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, GearIcon, HeartIcon, PlayIcon } from "@/components/Icons";

interface Feed {
  name: string;
  private: boolean;
}

interface Cover {
  count: number;
  cover: { type: "video" | "image"; src: string } | null;
}

// How long each card's video preview plays before the next card takes over.
const PREVIEW_MS = 4500;

// Stable, distinct gradient per feed name (shown until the cover loads, and
// for empty feeds).
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(145deg, hsl(${hue} 70% 42%), hsl(${(hue + 40) % 360} 75% 22%))`;
}

export default function HomePage() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [privateVisible, setPrivateVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Feeds whose cover is a video; they take turns playing a short preview.
  const [videoFeeds, setVideoFeeds] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [feedRes, privRes] = await Promise.all([
      fetch("/api/feeds").catch(() => null),
      fetch("/api/private").catch(() => null),
    ]);
    const feedData = feedRes?.ok ? await feedRes.json() : { feeds: [] };
    const privData = privRes?.ok ? await privRes.json() : { visible: false };
    setFeeds(feedData.feeds);
    setPrivateVisible(Boolean(privData.visible));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(Boolean(d?.isAdmin)))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, PREVIEW_MS);
    return () => clearInterval(t);
  }, []);

  const onVideoCover = useCallback((name: string) => {
    setVideoFeeds((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  async function hidePrivate() {
    await fetch("/api/private", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hide" }),
    }).catch(() => null);
    load();
  }

  const visibleNames = new Set(feeds.map((f) => f.name));
  const rotation = videoFeeds.filter((n) => visibleNames.has(n));
  const previewing = rotation.length ? rotation[tick % rotation.length] : null;

  return (
    <main className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark"><PlayIcon size={16} /></span>
          VideoLoop
        </div>
        <div className="header-actions">
          {privateVisible && (
            <button className="chip" onClick={hidePrivate} aria-label="Hide private feeds">
              <EyeOffIcon size={14} /> Hide private
            </button>
          )}
          <Link href="/favorites" className="icon-btn ghost" aria-label="Favorites">
            <HeartIcon size={21} />
          </Link>
          <Link href="/settings" className="icon-btn ghost" aria-label="Settings">
            <GearIcon />
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="feed-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="feed-card skeleton" />
          ))}
        </div>
      ) : feeds.length === 0 ? (
        <div className="empty">
          <p>No feeds yet.</p>
          {isAdmin ? (
            <Link href="/admin/feeds" className="pill-btn primary" style={{ marginTop: "1rem" }}>
              Add folders
            </Link>
          ) : (
            <p>Ask an admin to add some folders.</p>
          )}
        </div>
      ) : (
        <div className="feed-grid">
          {feeds.map((feed) => (
            <FeedCard
              key={feed.name}
              feed={feed}
              previewing={previewing === feed.name}
              onVideoCover={onVideoCover}
              onOpen={() => router.push(`/feed/${encodeURIComponent(feed.name)}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// A feed tile showing a random item from the feed as its cover. Video covers
// show a still frame and play a short muted preview when it's their turn (or
// on hover with a mouse).
function FeedCard({
  feed,
  previewing,
  onVideoCover,
  onOpen,
}: {
  feed: Feed;
  previewing: boolean;
  onVideoCover: (name: string) => void;
  onOpen: () => void;
}) {
  const [info, setInfo] = useState<Cover | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cover = info?.cover ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feeds/${encodeURIComponent(feed.name)}/cover`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Cover | null) => {
        if (cancelled || !d) return;
        setInfo(d);
        if (d.cover?.type === "video") onVideoCover(feed.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feed.name, onVideoCover]);

  // Set/clear the video source by hand so leaving the page aborts the
  // download straight away and frees its connection for the feed viewer.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || cover?.type !== "video") return;
    el.src = `${cover.src}#t=0.5`; // start half a second in: skips black first frames
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [cover]);

  const playing = previewing || hover;
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !ready) return;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing, ready]);

  return (
    <button
      className="feed-card"
      style={{ background: gradientFor(feed.name) }}
      onClick={onOpen}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {cover?.type === "video" && (
        <video
          ref={videoRef}
          className={`feed-card-cover ${ready ? "ready" : ""}`}
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          onLoadedData={() => setReady(true)}
        />
      )}
      {cover?.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`feed-card-cover ${ready ? "ready" : ""}`}
          src={cover.src}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setReady(true)}
        />
      )}
      {feed.private && (
        <span className="feed-card-tag">
          <EyeIcon size={12} /> Private
        </span>
      )}
      <span className="feed-card-text">
        <span className="feed-card-name">{feed.name}</span>
        {info && (
          <span className="feed-card-count">
            {info.count === 0 ? "Empty" : `${info.count.toLocaleString()} item${info.count === 1 ? "" : "s"}`}
          </span>
        )}
      </span>
    </button>
  );
}
