"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackIcon } from "@/components/Icons";

export default function SettingsPage() {
  const router = useRouter();
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="home">
      <header className="home-header">
        <Link href="/" className="icon-btn ghost" aria-label="Back">
          <BackIcon />
        </Link>
        <div className="brand">Settings</div>
        <span style={{ width: 42 }} />
      </header>

      {!loaded ? (
        <div className="spinner" style={{ margin: "3rem auto" }} />
      ) : (
        <>
          <div className="group">
            <div className="row">
              <div>
                <div className="row-title">Signed in as</div>
                <div className="row-sub">{username}</div>
              </div>
            </div>
            <label className="row">
              <div>
                <div className="row-title">Auto-play next</div>
                <div className="row-sub">Advance when a video ends (images after a few seconds)</div>
              </div>
              <input
                type="checkbox"
                className="switch"
                checked={autoplay}
                disabled={saving}
                onChange={(e) => update(e.target.checked)}
              />
            </label>
          </div>

          {isAdmin && (
            <div className="group">
              <Link href="/admin/users" className="row link">
                <div>
                  <div className="row-title">Manage users</div>
                  <div className="row-sub">Add or remove accounts</div>
                </div>
                <span className="chev">›</span>
              </Link>
            </div>
          )}

          <div className="group">
            <button className="row danger" onClick={logout}>
              <div className="row-title">Sign out</div>
            </button>
          </div>

          <p className="hint">
            Tip: tap to pause, double-tap to favorite, hold the right/left side of a video to
            fast-forward/rewind, or drag the progress bar. On desktop: ↑/↓ or J/K to move, ←/→ to skip
            5s, Space, M to mute, F to favorite.
          </p>
        </>
      )}
    </main>
  );
}
