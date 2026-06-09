"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [autoplay, setAutoplay] = useState(true);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setAutoplay(Boolean(d.autoplay));
        setUsername(d.username || "");
        setIsAdmin(Boolean(d.isAdmin));
        setLoaded(true);
      });
  }, []);

  async function update(next: boolean) {
    setAutoplay(next);
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoplay: next }),
    });
    setSaving(false);
  }

  if (!loaded) return <div className="feed-list"><p className="empty">Loading…</p></div>;

  return (
    <div className="feed-list">
      <header>
        <h1>Settings</h1>
        <nav className="topnav">
          <a href="/">Home</a>
        </nav>
      </header>

      <div className="settings-row">
        <div>
          <div style={{ fontWeight: 600 }}>Signed in as</div>
          <div style={{ color: "#aaa", fontSize: "0.9rem" }}>{username}</div>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div style={{ fontWeight: 600 }}>Auto-play next</div>
          <div style={{ color: "#aaa", fontSize: "0.9rem" }}>
            Advance to the next clip when a video finishes
          </div>
        </div>
        <label className="checkbox-row" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={autoplay}
            disabled={saving}
            onChange={(e) => update(e.target.checked)}
          />
          {autoplay ? "On" : "Off"}
        </label>
      </div>

      {isAdmin && (
        <div className="settings-row">
          <div>
            <div style={{ fontWeight: 600 }}>Manage users</div>
            <div style={{ color: "#aaa", fontSize: "0.9rem" }}>
              Add or remove accounts
            </div>
          </div>
          <a href="/admin/users" style={{ color: "#4da3ff" }}>
            Open →
          </a>
        </div>
      )}
    </div>
  );
}
