"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackIcon, EyeOffIcon, FolderIcon } from "@/components/Icons";

interface Feed {
  id: string;
  name: string;
  path: string;
  private: boolean;
  missing: boolean;
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, data };
}

export default function AdminFeedsPage() {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  // Folder browser: current folder (relative to the media root) + its subfolders.
  const [path, setPath] = useState("");
  const [folders, setFolders] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Feed being edited in the bottom sheet.
  const [editing, setEditing] = useState<Feed | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");

  const loadFeeds = useCallback(async () => {
    const res = await api("/api/admin/feeds", "GET");
    if (res.status === 403 || res.status === 401) return setForbidden(true);
    if (res.ok) setFeeds(res.data.feeds);
  }, []);

  const browse = useCallback(async (next: string) => {
    setFolders(null);
    setPath(next);
    const res = await api(`/api/admin/browse?path=${encodeURIComponent(next)}`, "GET");
    setFolders(res.ok ? res.data.folders : []);
  }, []);

  useEffect(() => {
    loadFeeds();
    browse("");
  }, [loadFeeds, browse]);

  const feedPaths = new Set((feeds || []).map((f) => f.path));
  const childPath = (name: string) => (path ? `${path}/${name}` : name);

  async function add(paths: string[]) {
    setBusy(true);
    setError("");
    for (const p of paths) {
      const res = await api("/api/admin/feeds", "POST", { path: p });
      if (!res.ok) {
        setError(res.data?.error || "Couldn't add that folder");
        break;
      }
    }
    await loadFeeds();
    setBusy(false);
  }

  function openEdit(feed: Feed) {
    setEditing(feed);
    setEditName(feed.name);
    setEditError("");
  }

  async function saveEdit(patch: { name?: string; private?: boolean }) {
    if (!editing) return;
    const res = await api("/api/admin/feeds", "PATCH", { id: editing.id, ...patch });
    if (!res.ok) return setEditError(res.data?.error || "Couldn't save");
    await loadFeeds();
    if (patch.name !== undefined) setEditing(null);
    else setEditing({ ...editing, ...patch });
  }

  async function remove() {
    if (!editing) return;
    if (!window.confirm(`Remove "${editing.name}" from VideoLoop? The files stay on the share.`)) return;
    await api(`/api/admin/feeds?id=${encodeURIComponent(editing.id)}`, "DELETE");
    setEditing(null);
    loadFeeds();
  }

  if (forbidden) {
    return (
      <main className="home">
        <p className="empty">You need an admin account to manage feeds.</p>
      </main>
    );
  }

  const crumbs = path ? path.split("/") : [];
  const addable = (folders || []).map(childPath).filter((p) => !feedPaths.has(p));

  return (
    <main className="home">
      <header className="home-header">
        <Link href="/settings" className="icon-btn ghost" aria-label="Back">
          <BackIcon />
        </Link>
        <div className="brand">Feeds</div>
        <span style={{ width: 42 }} />
      </header>

      <h2 className="section-title">Your feeds</h2>
      {feeds === null ? (
        <div className="spinner" style={{ margin: "2rem auto" }} />
      ) : feeds.length === 0 ? (
        <p className="hint" style={{ marginBottom: "1rem" }}>
          No feeds yet. Pick folders below to add them.
        </p>
      ) : (
        <div className="group">
          {feeds.map((f) => (
            <button key={f.id} className="row link" onClick={() => openEdit(f)}>
              <div className="row-main">
                <div className="row-title">
                  {f.name}
                  {f.private && (
                    <span className="mini-tag">
                      <EyeOffIcon size={11} /> Private
                    </span>
                  )}
                </div>
                <div className={`row-sub ${f.missing ? "warn" : ""}`}>
                  {f.missing ? `Folder not found: ${f.path}` : f.path}
                </div>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}

      <h2 className="section-title">Add a folder</h2>
      <nav className="crumbs" aria-label="Current folder">
        <button onClick={() => browse("")} disabled={!path}>
          Media
        </button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <span className="crumb-sep">/</span>
            <button
              onClick={() => browse(crumbs.slice(0, i + 1).join("/"))}
              disabled={i === crumbs.length - 1}
            >
              {c}
            </button>
          </span>
        ))}
      </nav>
      {error && <div className="error">{error}</div>}

      {folders === null ? (
        <div className="spinner" style={{ margin: "2rem auto" }} />
      ) : folders.length === 0 ? (
        <p className="hint">
          {path
            ? "No subfolders in here."
            : "Nothing is mounted under the media folder. Check the SMB share settings."}
        </p>
      ) : (
        <>
          <div className="group">
            {folders.map((name) => {
              const p = childPath(name);
              const added = feedPaths.has(p);
              return (
                <div key={name} className="row folder-row">
                  <button className="folder-open" onClick={() => browse(p)}>
                    <FolderIcon />
                    <span>{name}</span>
                  </button>
                  <button
                    className={`pill-btn ${added ? "" : "primary"}`}
                    disabled={added || busy}
                    onClick={() => add([p])}
                  >
                    {added ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
          {addable.length > 1 && (
            <button className="text-btn" disabled={busy} onClick={() => add(addable)}>
              Add all {addable.length} folders here
            </button>
          )}
        </>
      )}
      <p className="hint" style={{ marginTop: "1rem" }}>
        Tap a folder name to look inside it. A feed plays everything in its folder, including
        subfolders.
      </p>

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <form
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit({ name: editName });
            }}
          >
            <div className="sheet-handle" />
            <h3>Edit feed</h3>
            <p className="sheet-sub">{editing.path}</p>
            {editError && <div className="error">{editError}</div>}
            <input
              type="text"
              className="text-input"
              aria-label="Feed name"
              value={editName}
              maxLength={60}
              onChange={(e) => setEditName(e.target.value)}
            />
            <label className="row sheet-row">
              <div>
                <div className="row-title">Private</div>
                <div className="row-sub">Hidden until revealed in Settings</div>
              </div>
              <input
                type="checkbox"
                className="switch"
                checked={editing.private}
                onChange={(e) => saveEdit({ private: e.target.checked })}
              />
            </label>
            <button className="btn" type="submit" disabled={!editName.trim()}>
              Save
            </button>
            <button type="button" className="text-btn danger" onClick={remove}>
              Remove feed
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
