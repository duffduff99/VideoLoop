"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BackIcon, HeartIcon, MuteIcon, PlayIcon, VolumeIcon } from "./Icons";

export interface Item {
  feed: string;
  path: string;
  name: string;
  type: "video" | "image";
  mime: string;
  favorite: boolean;
  src: string;
}

export interface PageResult {
  items: Item[];
  nextCursor: number | null;
  // HTTP status when the request failed (401 → login, 403 → locked feed).
  status?: number;
}

interface Props {
  // Fetches a page of items for a given cycle (cycle is used to re-randomize
  // each time the feed loops). nextCursor is null when the cycle is exhausted.
  fetchPage: (cursor: number, cycle: number) => Promise<PageResult>;
  autoplaySetting: boolean;
  title: string;
  // Slide to open on once the first page has loaded (e.g. from a gallery).
  startIndex?: number;
  // Where the back button / Esc goes. Defaults to the feed list.
  onBack?: () => void;
}

// Only slides this close to the active one mount real <video>/<img> elements;
// the rest are empty placeholders, so an endlessly looping feed stays light.
const RENDER_WINDOW = 2;
// How long an image stays on screen before auto-advancing (auto-play on).
const IMAGE_SECONDS = 6;
// Load the next page when the active slide is this close to the end.
const PREFETCH_AHEAD = 3;
const DOUBLE_TAP_MS = 260;
// Press-and-hold on a video side: after this delay, fast-forward (right half)
// or rewind (left half) at HOLD_SPEED until released.
const HOLD_DELAY_MS = 350;
const HOLD_SPEED = 2;
// A finger moving further than this is a swipe, not a tap/hold.
const MOVE_TOLERANCE_PX = 12;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function prettyName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readMutedPref(): boolean {
  try {
    return localStorage.getItem("vl_muted") === "1";
  } catch {
    return false;
  }
}

function writeMutedPref(muted: boolean) {
  try {
    localStorage.setItem("vl_muted", muted ? "1" : "0");
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

export default function FeedViewer({
  fetchPage,
  autoplaySetting,
  title,
  startIndex = 0,
  onBack,
}: Props) {
  const router = useRouter();
  const goBack = useCallback(() => (onBack ? onBack() : router.push("/")), [onBack, router]);
  const [items, setItems] = useState<Item[]>([]);
  const [muted, setMutedState] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Scrubbing via the draggable progress bar (ratio 0..1 while dragging).
  const [scrub, setScrub] = useState<number | null>(null);
  // Press-and-hold seek direction while active.
  const [holding, setHolding] = useState<"forward" | "rewind" | null>(null);
  const [flash, setFlash] = useState<{ kind: "play" | "heart"; key: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewindTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const holdFired = useRef(false);
  const startApplied = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const cursorRef = useRef<number | null>(0);
  const cycleRef = useRef(0);
  const itemsLenRef = useRef(0);
  const loadingRef = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the per-device mute preference after mount (avoids SSR mismatch).
  useEffect(() => {
    setMutedState(readMutedPref());
  }, []);

  const setMuted = useCallback((next: boolean | ((m: boolean) => boolean)) => {
    setMutedState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeMutedPref(value);
      return value;
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    let cursor = cursorRef.current;
    let cycle = cycleRef.current;
    // End of a cycle: loop forever by starting a fresh (re-shuffled) cycle,
    // but only if the feed actually has content.
    if (cursor === null) {
      if (itemsLenRef.current === 0) return;
      cycle += 1;
      cursor = 0;
    }
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetchPage(cursor, cycle);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        // Locked feed opened directly without unlocking — go pick it at home.
        router.replace("/");
        return;
      }
      cycleRef.current = cycle;
      cursorRef.current = res.nextCursor;
      if (res.items.length > 0) {
        setItems((prev) => {
          const next = [...prev, ...res.items];
          itemsLenRef.current = next.length;
          return next;
        });
      } else if (itemsLenRef.current === 0) {
        setExhausted(true);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchPage, router]);

  // Initial load.
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // Prefetch the next page as the viewer approaches the end of what's loaded.
  useEffect(() => {
    if (items.length > 0 && activeIndex >= items.length - PREFETCH_AHEAD) {
      loadMore();
    }
  }, [activeIndex, items.length, loadMore]);

  // Track the active (mostly visible) slide.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll(".slide").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items.length]);

  // Open on a specific slide (e.g. tapped in the favorites gallery) once it
  // has been loaded. Jump instantly rather than animating through the feed.
  useEffect(() => {
    if (startApplied.current || startIndex <= 0 || items.length <= startIndex) return;
    const root = containerRef.current;
    if (!root) return;
    startApplied.current = true;
    root.scrollTop = startIndex * root.clientHeight;
    setActiveIndex(startIndex);
  }, [items.length, startIndex]);

  const clearHoldTimers = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (rewindTimer.current) clearInterval(rewindTimer.current);
    holdTimer.current = null;
    rewindTimer.current = null;
  }, []);

  const stopHold = useCallback(() => {
    clearHoldTimers();
    setHolding(null);
  }, [clearHoldTimers]);

  // New active slide: reset transient playback UI.
  useEffect(() => {
    setPaused(false);
    setProgress(0);
    setScrub(null);
    setFlash(null);
    stopHold();
    const v = videoRefs.current.get(activeIndex);
    setDuration(v && isFinite(v.duration) ? v.duration : 0);
  }, [activeIndex, stopHold]);

  // Drive playback: play the active video, pause the others. If the browser
  // blocks autoplay with sound, fall back to muted so playback still starts.
  // Hold-to-seek lives here too: fast-forward raises the playback rate, and
  // rewind keeps the video paused while a timer steps it backwards.
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === activeIndex) {
        video.muted = muted;
        video.playbackRate = holding === "forward" ? HOLD_SPEED : 1;
        if (paused || holding === "rewind") {
          video.pause();
          return;
        }
        video.play().catch((err: DOMException) => {
          // Only the autoplay-with-sound block should force mute; other
          // failures (unsupported codec, aborted load) must not flip it.
          if (err?.name === "NotAllowedError" && !video.muted) {
            video.muted = true;
            setMutedState(true);
            video.play().catch(() => {});
          }
        });
      } else if (!video.paused || video.currentTime > 0) {
        video.pause();
        video.playbackRate = 1;
        video.currentTime = 0;
      }
    });
  }, [activeIndex, muted, paused, holding, items.length]);

  // Pause when the app/tab is hidden; resume when it comes back.
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRefs.current.get(activeIndex);
      if (!video) return;
      if (document.hidden) video.pause();
      else if (!paused) video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeIndex, paused]);

  const goTo = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root || index < 0) return;
    const target = root.querySelector(`.slide[data-index="${index}"]`) as HTMLElement | null;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const advance = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex]);

  // Images auto-advance after a few seconds when auto-play is on.
  const activeItem = items[activeIndex];
  useEffect(() => {
    if (!autoplaySetting || !activeItem || activeItem.type !== "image" || paused) return;
    const t = setTimeout(advance, IMAGE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [autoplaySetting, activeItem, paused, advance]);

  const setFavorite = useCallback(
    async (idx: number, desired?: boolean) => {
      const item = items[idx];
      if (!item) return;
      if (desired !== undefined && item.favorite === desired) return;
      // Optimistic update so the heart reacts instantly.
      const optimistic = desired ?? !item.favorite;
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, favorite: optimistic } : it)));
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed: item.feed, path: item.path }),
      }).catch(() => null);
      if (res?.status === 401) {
        router.replace("/login");
        return;
      }
      const ok = res?.ok ? await res.json().catch(() => null) : null;
      const actual = ok ? Boolean(ok.favorite) : item.favorite; // revert on failure
      // Keep every copy of this item (it can repeat across loop cycles) in sync.
      setItems((prev) =>
        prev.map((it) =>
          it.feed === item.feed && it.path === item.path ? { ...it, favorite: actual } : it
        )
      );
    },
    [items, router]
  );

  const togglePause = useCallback(() => {
    if (!items[activeIndex]) return;
    // Pausing shows a persistent play glyph; resuming flashes it briefly.
    if (paused) setFlash({ kind: "play", key: Date.now() });
    setPaused(!paused);
  }, [items, activeIndex, paused]);

  // Seek the active video by a number of seconds (keyboard arrows).
  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRefs.current.get(activeIndex);
      if (!v || !isFinite(v.duration)) return;
      v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration);
    },
    [activeIndex]
  );

  // ---- Press-and-hold to fast-forward / rewind (videos only) ----
  function onMediaPointerDown(e: React.PointerEvent<HTMLDivElement>, idx: number) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    holdFired.current = false;
    clearHoldTimers();
    if (idx !== activeIndex || items[idx]?.type !== "video") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX > rect.left + rect.width / 2 ? "forward" : "rewind";
    holdTimer.current = setTimeout(() => {
      holdFired.current = true;
      setHolding(side);
      if (side === "forward") {
        setPaused(false);
      } else {
        const step = (HOLD_SPEED * 100) / 1000; // seconds per 100ms tick
        rewindTimer.current = setInterval(() => {
          const v = videoRefs.current.get(idx);
          if (v) v.currentTime = Math.max(0, v.currentTime - step);
        }, 100);
      }
    }, HOLD_DELAY_MS);
  }

  function onMediaPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || holdFired.current) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) {
      // It's a swipe, not a hold or a tap.
      clearHoldTimers();
      pointerStart.current = null;
    }
  }

  function onMediaPointerUp(idx: number) {
    const wasTap = pointerStart.current !== null && !holdFired.current;
    pointerStart.current = null;
    if (holdFired.current) {
      holdFired.current = false;
      stopHold();
      return;
    }
    clearHoldTimers();
    if (wasTap) onSlideTap(idx);
  }

  function onMediaPointerCancel() {
    // The browser took over (scroll started) — abandon any tap/hold.
    pointerStart.current = null;
    holdFired.current = false;
    stopHold();
  }

  // ---- Draggable progress bar (scrubbing) ----
  function scrubTo(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setScrub(ratio);
    const v = videoRefs.current.get(activeIndex);
    if (v && isFinite(v.duration)) v.currentTime = ratio * v.duration;
  }

  function onScrubDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e);
  }

  function onScrubMove(e: React.PointerEvent<HTMLDivElement>) {
    if (scrub === null) return;
    scrubTo(e);
  }

  function onScrubEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (scrub !== null) setProgress(scrub);
    setScrub(null);
  }

  // Single tap = play/pause, double tap = favorite (with a heart burst).
  function onSlideTap(idx: number) {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setFavorite(idx, true);
      setFlash({ kind: "heart", key: Date.now() });
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      togglePause();
    }, DOUBLE_TAP_MS);
  }

  // Desktop keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
        case "j":
          e.preventDefault();
          goTo(activeIndex + 1);
          break;
        case "ArrowUp":
        case "PageUp":
        case "k":
          e.preventDefault();
          goTo(activeIndex - 1);
          break;
        case " ":
          e.preventDefault();
          togglePause();
          break;
        case "m":
          setMuted((m) => !m);
          break;
        case "ArrowRight":
        case "l":
          e.preventDefault();
          seekBy(5);
          break;
        case "ArrowLeft":
        case "h":
          e.preventDefault();
          seekBy(-5);
          break;
        case "f":
          setFavorite(activeIndex);
          break;
        case "Escape":
          goBack();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, goTo, togglePause, setMuted, setFavorite, seekBy, goBack]);

  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      clearHoldTimers();
    },
    [clearHoldTimers]
  );

  const showImageProgress =
    autoplaySetting && activeItem?.type === "image" && !paused;

  return (
    <div className="viewer-shell">
      <div className="viewer-topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <BackIcon />
        </button>
        <div className="viewer-title">{title}</div>
        <button
          className="icon-btn"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MuteIcon /> : <VolumeIcon />}
        </button>
      </div>

      <div className="viewer" ref={containerRef}>
        {items.map((item, idx) => {
          const near = Math.abs(idx - activeIndex) <= RENDER_WINDOW;
          const isActive = idx === activeIndex;
          return (
            <section className="slide" key={idx} data-index={idx}>
              {near && (
                <div
                  className="slide-media"
                  onPointerDown={(e) => onMediaPointerDown(e, idx)}
                  onPointerMove={onMediaPointerMove}
                  onPointerUp={() => onMediaPointerUp(idx)}
                  onPointerCancel={onMediaPointerCancel}
                  onPointerLeave={() => holdFired.current && stopHold()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {item.type === "video" ? (
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(idx, el);
                        else videoRefs.current.delete(idx);
                      }}
                      src={item.src}
                      playsInline
                      loop={!autoplaySetting}
                      muted={muted}
                      preload={Math.abs(idx - activeIndex) <= 1 ? "auto" : "metadata"}
                      onLoadedMetadata={(e) => {
                        if (isActive) setDuration(e.currentTarget.duration);
                      }}
                      onTimeUpdate={(e) => {
                        if (!isActive) return;
                        const v = e.currentTarget;
                        if (v.duration) {
                          setProgress(v.currentTime / v.duration);
                          if (v.duration !== duration) setDuration(v.duration);
                        }
                      }}
                      onEnded={() => {
                        if (autoplaySetting && isActive) advance();
                      }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.src} alt={prettyName(item.name)} decoding="async" draggable={false} />
                  )}
                </div>
              )}

              {isActive && paused && (
                <div className="center-glyph persistent">
                  <PlayIcon />
                </div>
              )}
              {isActive && flash && (
                <div key={flash.key} className={`center-glyph flash ${flash.kind}`}>
                  {flash.kind === "heart" ? <HeartIcon size={96} filled /> : <PlayIcon />}
                </div>
              )}

              <div className="slide-actions">
                <button
                  className={`action-btn ${item.favorite ? "active" : ""}`}
                  onClick={() => setFavorite(idx)}
                  aria-label={item.favorite ? "Remove favorite" : "Add favorite"}
                >
                  <HeartIcon filled={item.favorite} />
                </button>
              </div>

              <div className="slide-caption">
                <div className="caption-feed">{item.feed}</div>
                <div className="caption-name">{prettyName(item.name)}</div>
              </div>

              {isActive && holding && (
                <div className="hold-badge">
                  {holding === "forward" ? `${HOLD_SPEED}× ▶▶` : `◀◀ ${HOLD_SPEED}×`}
                </div>
              )}

              {isActive && scrub !== null && (
                <div className="scrub-time">
                  {formatTime(scrub * duration)} <span>/ {formatTime(duration)}</span>
                </div>
              )}

              {isActive && item.type === "video" && (
                <div
                  className={`scrubber ${scrub !== null ? "dragging" : ""}`}
                  onPointerDown={onScrubDown}
                  onPointerMove={onScrubMove}
                  onPointerUp={onScrubEnd}
                  onPointerCancel={onScrubEnd}
                  role="slider"
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round((scrub ?? progress) * duration)}
                >
                  <div className="scrub-track">
                    <div
                      className="progress-fill"
                      style={{ transform: `scaleX(${scrub ?? progress})` }}
                    />
                    <div className="scrub-thumb" style={{ left: `${(scrub ?? progress) * 100}%` }} />
                  </div>
                </div>
              )}
              {isActive && showImageProgress && (
                <div className="progress">
                  <div
                    key={activeIndex}
                    className="progress-fill timed"
                    style={{ animationDuration: `${IMAGE_SECONDS}s` }}
                  />
                </div>
              )}
            </section>
          );
        })}

        {items.length === 0 && (
          <div className="viewer-empty">
            {loading ? <div className="spinner" /> : exhausted ? "Nothing to play in this feed yet." : null}
          </div>
        )}
      </div>
    </div>
  );
}
