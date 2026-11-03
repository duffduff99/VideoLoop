"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FeedViewer, { Item, PageResult } from "@/components/FeedViewer";
import { BackIcon, HeartIcon, PlayIcon } from "@/components/Icons";

export default function FavoritesPage() {
  return (
    <Suspense>
      <Favorites />
    </Suspense>
  );
}

function Favorites() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("i");
  const openIndex = raw !== null && /^\d+$/.test(raw) ? parseInt(raw, 10) : null;

  const [items, setItems] = useState<Item[] | null>(null);
  const [autoplay, setAutoplay] = useState<boolean | null>(null);
  const itemsRef = useRef<Item[]>([]);
  // True when the viewer was opened by tapping a tile, so "back" can simply
  // pop history (matching the phone's own back gesture).
  const openedFromGrid = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/favorites").catch(() => null);
    if (res?.status === 401) {
      router.replace("/login");
      return;
    }
    const data = res?.ok ? await res.json() : { items: [] };
    itemsRef.current = data.items;
    setItems(data.items);
  }, [router]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : { autoplay: true }))
      .then((d) => setAutoplay(Boolean(d.autoplay)))
      .catch(() => setAutoplay(true));
  }, []);

  // Load on mount, and reload whenever we return to the grid so anything
  // un-favorited in the viewer disappears.
  useEffect(() => {
    if (openIndex === null || items === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex, load]);

  // The viewer replays the already-loaded favorites (and loops them).
  const fetchPage = useCallback(async (cursor: number): Promise<PageResult> => {
    if (cursor > 0) return { items: [], nextCursor: null };
    return { items: itemsRef.current, nextCursor: null };
  }, []);

  const closeViewer = useCallback(() => {
    if (openedFromGrid.current) {
      openedFromGrid.current = false;
      router.back();
    } else {
      router.replace("/favorites");
    }
  }, [router]);

  function openItem(index: number) {
    openedFromGrid.current = true;
    router.push(`/favorites?i=${index}`, { scroll: false });
  }

  if (openIndex !== null) {
    if (items === null || autoplay === null) {
      return (
        <div className="viewer-empty">
          <div className="spinner" />
        </div>
      );
    }
    return (
      <FeedViewer
        key={`fav-${openIndex}`}
        title="Favorites"
        startIndex={Math.min(openIndex, Math.max(items.length - 1, 0))}
        fetchPage={fetchPage}
        autoplaySetting={autoplay}
        onBack={closeViewer}
      />
    );
  }

  return (
    <main className="home">
      <header className="home-header">
        <Link href="/" className="icon-btn ghost" aria-label="Back to feeds">
          <BackIcon />
        </Link>
        <div className="brand">Favorites</div>
        <span className="header-count">{items ? items.length : ""}</span>
      </header>

      {items === null ? (
        <div className="gallery">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="gallery-tile skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <HeartIcon size={40} />
          <p style={{ marginTop: "0.75rem" }}>
            No favorites yet.
            <br />
            Double-tap anything in a feed (or tap ♥) to save it here.
          </p>
        </div>
      ) : (
        <div className="gallery">
          {items.map((item, i) => (
            <GalleryTile key={`${item.feed}/${item.path}`} item={item} onOpen={() => openItem(i)} />
          ))}
        </div>
      )}
    </main>
  );
}

// A thumbnail that only loads its media once scrolled near the viewport.
function GalleryTile({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const label = item.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ");

  return (
    <button ref={ref} className="gallery-tile" onClick={onOpen} aria-label={`Open ${label}`}>
      {visible &&
        (item.type === "video" ? (
          // "#t=0.5" asks the browser to show a frame from half a second in
          // as the poster, instead of a black first frame.
          <video src={`${item.src}#t=0.5`} preload="metadata" muted playsInline tabIndex={-1} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.src} alt="" loading="lazy" decoding="async" draggable={false} />
        ))}
      {item.type === "video" && (
        <span className="tile-badge">
          <PlayIcon size={14} />
        </span>
      )}
      <span className="tile-name">{label}</span>
    </button>
  );
}
