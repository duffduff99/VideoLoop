"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GearIcon, HeartIcon, LockIcon, PlayIcon, UnlockIcon } from "@/components/Icons";

interface Feed {
  name: string;
  locked: boolean;
  unlocked: boolean;
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
  const [unlocking, setUnlocking] = useState<Feed | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/feeds")
      .then((r) => (r.ok ? r.json() : { feeds: [] }))
      .then((d) => setFeeds(d.feeds))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (unlocking) setTimeout(() => inputRef.current?.focus(), 50);
  }, [unlocking]);

  function openFeed(feed: Feed) {
    if (feed.locked && !feed.unlocked) {
      setPassword("");
      setUnlockError("");
      setUnlocking(feed);
      return;
    }
    router.push(`/feed/${encodeURIComponent(feed.name)}`);
  }

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!unlocking) return;
    setBusy(true);
    setUnlockError("");
    const res = await fetch("/api/feeds/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feed: unlocking.name, password }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setUnlockError("Incorrect password");
      return;
    }
    const name = unlocking.name;
    setUnlocking(null);
    router.push(`/feed/${encodeURIComponent(name)}`);
  }

  return (
    <main className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark"><PlayIcon size={16} /></span>
          VideoLoop
        </div>
        <Link href="/settings" className="icon-btn ghost" aria-label="Settings">
          <GearIcon />
        </Link>
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
              onClick={() => openFeed(feed)}
            >
              <span className="feed-card-play"><PlayIcon size={20} /></span>
              <span className="feed-card-name">{feed.name}</span>
              {feed.locked && (
                <span className="feed-card-lock">
                  {feed.unlocked ? <UnlockIcon /> : <LockIcon />}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {unlocking && (
        <div className="sheet-backdrop" onClick={() => setUnlocking(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submitUnlock}>
            <div className="sheet-handle" />
            <h3>
              <LockIcon size={18} /> {unlocking.name}
            </h3>
            <p className="sheet-sub">This feed is password protected.</p>
            {unlockError && <div className="error">{unlockError}</div>}
            <input
              ref={inputRef}
              type="password"
              className="text-input"
              placeholder="Feed password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <button className="btn" type="submit" disabled={busy || !password}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
