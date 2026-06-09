"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Feed {
  name: string;
  locked: boolean;
  unlocked: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/feeds");
    if (res.ok) {
      const data = await res.json();
      setFeeds(data.feeds);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function openFeed(feed: Feed) {
    if (feed.locked && !feed.unlocked) {
      const password = window.prompt(`Password for "${feed.name}"`);
      if (!password) return;
      const res = await fetch("/api/feeds/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed: feed.name, password }),
      });
      if (!res.ok) {
        alert("Incorrect password");
        return;
      }
    }
    router.push(`/feed/${encodeURIComponent(feed.name)}`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="feed-list">
      <header>
        <h1>VideoLoop</h1>
        <nav className="topnav">
          <a href="/favorites">Favorites</a>
          <a href="/settings">Settings</a>
          <button
            onClick={logout}
            style={{ background: "none", border: "none", color: "#aaa" }}
          >
            Logout
          </button>
        </nav>
      </header>

      {loading ? (
        <p className="empty">Loading feeds…</p>
      ) : feeds.length === 0 ? (
        <p className="empty">
          No feeds found. Add top-level folders to your media share.
        </p>
      ) : (
        <div className="feed-grid">
          {feeds.map((feed) => (
            <button
              key={feed.name}
              className="feed-tile"
              onClick={() => openFeed(feed)}
            >
              <span className="name">{feed.name}</span>
              {feed.locked && (
                <span className="lock">
                  {feed.unlocked ? "🔓 unlocked" : "🔒 locked"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
