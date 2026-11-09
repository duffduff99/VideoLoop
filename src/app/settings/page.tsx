"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackIcon, EyeIcon, EyeOffIcon } from "@/components/Icons";

interface PrivateStatus {
  hasPrivate: boolean;
  visible: boolean;
  until: number | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [autoplay, setAutoplay] = useState(true);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [priv, setPriv] = useState<PrivateStatus | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [privError, setPrivError] = useState("");
  const [privBusy, setPrivBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  const loadPrivate = useCallback(() => {
    fetch("/api/private")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPriv(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPrivate();
  }, [loadPrivate]);

  useEffect(() => {
    if (sheetOpen) setTimeout(() => pwRef.current?.focus(), 50);
  }, [sheetOpen]);

  async function privateAction(action: "show" | "hide", pw?: string) {
    setPrivBusy(true);
    setPrivError("");
    const res = await fetch("/api/private", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, password: pw }),
    }).catch(() => null);
    setPrivBusy(false);
    if (res?.status === 401) {
      router.replace("/login");
      return;
    }
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setPrivError(data?.error || "Something went wrong");
      return;
    }
    setPriv(data);
    setSheetOpen(false);
    setPassword("");
  }

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

          {priv?.hasPrivate && (
            <div className="group">
              <div className="row">
                <div>
                  <div className="row-title">Private feeds</div>
                  <div className="row-sub">
                    {priv.visible && priv.until
                      ? `Visible until ${new Date(priv.until).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : "Hidden from the home screen and favorites"}
                  </div>
                </div>
                {priv.visible ? (
                  <button
                    className="pill-btn"
                    disabled={privBusy}
                    onClick={() => privateAction("hide")}
                  >
                    <EyeOffIcon /> Hide
                  </button>
                ) : (
                  <button
                    className="pill-btn primary"
                    onClick={() => {
                      setPrivError("");
                      setPassword("");
                      setSheetOpen(true);
                    }}
                  >
                    <EyeIcon /> Show
                  </button>
                )}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="group">
              <Link href="/admin/feeds" className="row link">
                <div>
                  <div className="row-title">Manage feeds</div>
                  <div className="row-sub">Choose which folders appear as feeds</div>
                </div>
                <span className="chev">›</span>
              </Link>
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

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <form
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              privateAction("show", password);
            }}
          >
            <div className="sheet-handle" />
            <h3>
              <EyeIcon size={18} /> Show private feeds
            </h3>
            <p className="sheet-sub">Enter your account password to continue.</p>
            {privError && <div className="error">{privError}</div>}
            {/* Hidden username helps password managers fill the right entry. */}
            <input type="text" autoComplete="username" value={username} readOnly hidden />
            <input
              ref={pwRef}
              type="password"
              className="text-input"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn" type="submit" disabled={privBusy || !password}>
              {privBusy ? "Checking…" : "Show private feeds"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
