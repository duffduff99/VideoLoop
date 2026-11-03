"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, GearIcon, HeartIcon, PlayIcon } from "@/components/Icons";

interface Feed {
  name: string;
  private: boolean;
}

// Stable, distinct gradient per feed name.
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
  }, [load]);

  async function hidePrivate() {
    await fetch("/api/private", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hide" }),
    }).catch(() => null);
    load();
  }

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
          <Link href="/settings" className="icon-btn ghost" aria-label="Settings">
            <GearIcon />
          </Link>
        </div>
      </header>

      <Link href="/favorites" className="fav-banner">
        <HeartIcon filled size={22} />
        <span>Favorites</span>
        <span className="chev">›</span>
      </Link>

      <h2 className="section-title">Feeds</h2>

      {loading ? (
        <div className="feed-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="feed-card skeleton" />
          ))}
        </div>
      ) : feeds.length === 0 ? (
        <p className="empty">
          No feeds found. Check your SMB mount or the <code>FEEDS</code> setting.
        </p>
      ) : (
        <div className="feed-grid">
          {feeds.map((feed) => (
            <button
              key={feed.name}
              className="feed-card"
              style={{ background: gradientFor(feed.name) }}
              onClick={() => router.push(`/feed/${encodeURIComponent(feed.name)}`)}
            >
              <span className="feed-card-play"><PlayIcon size={20} /></span>
              <span className="feed-card-name">{feed.name}</span>
              {feed.private && (
                <span className="feed-card-tag">
                  <EyeIcon size={12} /> Private
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
