"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, isAdmin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }
      setUsername("");
      setPassword("");
      setIsAdmin(false);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id: string, name: string) {
    if (!window.confirm(`Delete user "${name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) load();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete");
    }
  }

  if (forbidden) {
    return (
      <div className="feed-list">
        <p className="empty">You need an admin account to manage users.</p>
        <p style={{ textAlign: "center" }}>
          <a href="/" style={{ color: "#aaa" }}>← Home</a>
        </p>
      </div>
    );
  }

  return (
    <div className="feed-list">
      <header>
        <h1>Users</h1>
        <nav className="topnav">
          <a href="/settings">Settings</a>
          <a href="/">Home</a>
        </nav>
      </header>

      <form className="card" style={{ maxWidth: "100%", marginBottom: "1.5rem" }} onSubmit={addUser}>
        <h1 style={{ fontSize: "1.1rem", textAlign: "left" }}>Add a user</h1>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="u">Username</label>
          <input id="u" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Administrator (can manage users)
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Adding…" : "Add user"}
        </button>
      </form>

      {users.map((u) => (
        <div className="settings-row" key={u.id}>
          <div>
            <div style={{ fontWeight: 600 }}>
              {u.username} {u.isAdmin && <span style={{ color: "#f5a623", fontSize: "0.8rem" }}>admin</span>}
            </div>
            <div style={{ color: "#aaa", fontSize: "0.85rem" }}>
              Added {new Date(u.createdAt).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => removeUser(u.id, u.username)}
            style={{ background: "none", border: "1px solid #333", color: "#ff6b6b", borderRadius: 8, padding: "0.4rem 0.7rem" }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
