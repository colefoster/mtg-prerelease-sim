import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getSet } from "../lib/sets";
import { generateSealedPool } from "../lib/pool";
import { generateSeed } from "../lib/rng";
import { FlipCard } from "../components/FlipCard";
import { HoverPreview } from "../components/HoverPreview";
import type { PackCard } from "../types";

const REVEAL_DELAY = 220;

/** Sort order for display: common, uncommon, extra, wildcard, land, rare-mythic, foil */
const SLOT_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  extra: 2,
  wildcard: 3,
  land: 4,
  "rare-mythic": 5,
  foil: 6,
  promo: 7,
};

function sortPackCards(cards: PackCard[]): PackCard[] {
  return [...cards].sort(
    (a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99),
  );
}

export function OpenPage() {
  const { setCode } = useParams<{ setCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const set = setCode ? getSet(setCode) : undefined;

  const seed = searchParams.get("seed");

  // Redirect to add seed if missing
  useEffect(() => {
    if (set && !seed) {
      navigate(`/open/${set.code}?seed=${generateSeed()}`, { replace: true });
    }
  }, [set, seed, navigate]);

  const pool = useMemo(
    () => (set && seed ? generateSealedPool(set, seed) : null),
    [set, seed],
  );

  const [packIndex, setPackIndex] = useState(0); // 0-5 = packs, 6 = promo
  const [revealedCount, setRevealedCount] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [large, setLarge] = useState(
    () => localStorage.getItem("openPage.largeCards") !== "0",
  );

  useEffect(() => {
    localStorage.setItem("openPage.largeCards", large ? "1" : "0");
  }, [large]);

  const currentCards = useMemo(() => {
    if (!pool) return [];
    if (packIndex < 6) return sortPackCards(pool.packs[packIndex].cards);
    if (packIndex === 6) return [pool.promo];
    return [];
  }, [pool, packIndex]);

  // Auto-reveal timer
  useEffect(() => {
    if (done || revealedCount >= currentCards.length) return;
    timerRef.current = setTimeout(() => {
      setRevealedCount((c) => c + 1);
    }, REVEAL_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [revealedCount, currentCards.length, done]);

  const skipOrAdvance = useCallback(() => {
    if (revealedCount < currentCards.length) {
      // Skip: reveal all
      clearTimeout(timerRef.current);
      setRevealedCount(currentCards.length);
    } else if (packIndex < 6) {
      // Next pack or promo
      setPackIndex((p) => p + 1);
      setRevealedCount(0);
    } else {
      setDone(true);
    }
  }, [revealedCount, currentCards.length, packIndex]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        skipOrAdvance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipOrAdvance]);

  if (!set) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-ctp-overlay0 text-center">
          <p>
            Set <span className="text-ctp-red">{setCode}</span> not found.
          </p>
          <Link to="/" className="text-ctp-mauve hover:text-ctp-lavender mt-4 inline-block">
            ← Back to sets
          </Link>
        </div>
      </div>
    );
  }

  if (!seed || !pool) return null;

  const allRevealed = revealedCount >= currentCards.length;
  const totalCards = pool.packs.reduce((s, p) => s + p.cards.length, 0) + 1;
  const totalRevealed =
    pool.packs
      .slice(0, packIndex)
      .reduce((s, p) => s + p.cards.length, 0) +
    (packIndex === 6 ? totalCards - 1 : 0) +
    Math.min(revealedCount, currentCards.length);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-72 bg-ctp-mantle border-r border-ctp-surface0 p-4 flex flex-col sticky top-0 h-screen overflow-y-auto shrink-0">
        <h2 className="text-lg font-semibold text-ctp-text mb-4">
          Prerelease Kit
        </h2>

        <div className="space-y-2 flex-1">
          {pool.packs.map((pack, i) => {
            const state =
              i < packIndex ? "done" : i === packIndex ? "current" : "pending";
            return (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  state === "current"
                    ? "bg-ctp-surface0 text-ctp-text"
                    : state === "done"
                      ? "bg-ctp-surface0/50 text-ctp-green"
                      : "text-ctp-overlay0"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Pack {i + 1}</span>
                  {state === "done" && <span>✓</span>}
                  {state === "current" && (
                    <span className="text-ctp-mauve">●</span>
                  )}
                </div>
                {state === "done" && (
                  <div className="flex gap-0.5 mt-1">
                    {pack.cards
                      .filter(
                        (c) =>
                          c.slot === "rare-mythic" || c.slot === "uncommon",
                      )
                      .slice(0, 4)
                      .map((c, j) => (
                        <img
                          key={j}
                          src={c.card.image}
                          alt=""
                          className="w-8 h-11 rounded-sm object-cover"
                        />
                      ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Promo */}
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              packIndex > 6
                ? "bg-ctp-surface0/50 text-ctp-green"
                : packIndex === 6
                  ? "bg-ctp-surface0 text-ctp-peach"
                  : "text-ctp-overlay0"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Promo</span>
              {done && packIndex >= 6 && <span>✓</span>}
              {packIndex === 6 && !done && (
                <span className="text-ctp-peach">★</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-ctp-surface0 text-sm text-ctp-overlay1">
          {totalRevealed}/{totalCards} cards
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 pb-24" onClick={skipOrAdvance}>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-ctp-text">
                {packIndex < 6
                  ? `Pack ${packIndex + 1}`
                  : packIndex === 6
                    ? "Promo"
                    : "All done!"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLarge(!large);
                }}
                className="text-sm text-ctp-overlay1 hover:text-ctp-text px-3 py-1 rounded bg-ctp-surface0 hover:bg-ctp-surface1"
              >
                {large ? "Small" : "Large"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/open/${set.code}?seed=${generateSeed()}`);
                  setPackIndex(0);
                  setRevealedCount(0);
                  setDone(false);
                }}
                className="text-sm text-ctp-overlay1 hover:text-ctp-text px-3 py-1 rounded bg-ctp-surface0 hover:bg-ctp-surface1"
              >
                Re-roll
              </button>
              <Link
                to="/"
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-ctp-overlay1 hover:text-ctp-text px-3 py-1 rounded bg-ctp-surface0 hover:bg-ctp-surface1"
              >
                Sets
              </Link>
            </div>
          </div>

          {/* Cards grid */}
          <div
            className={`grid gap-3 ${
              large
                ? "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
                : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))]"
            }`}
          >
            {currentCards.map((pc, i) => (
              <FlipCard
                key={`${packIndex}-${i}`}
                packCard={pc}
                revealed={i < revealedCount}
                large={large}
              />
            ))}

            {/* Skip / Next / Build tile */}
            {!done && (
              <div
                className="aspect-[5/7] rounded-lg border-2 border-dashed border-ctp-surface1 flex items-center justify-center cursor-pointer hover:border-ctp-mauve hover:bg-ctp-surface0/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  skipOrAdvance();
                }}
              >
                <span className="text-ctp-overlay1 text-sm font-medium">
                  {!allRevealed
                    ? "Skip"
                    : packIndex < 5
                      ? "Next pack →"
                      : packIndex === 5
                        ? "Reveal promo →"
                        : "Build deck →"}
                </span>
              </div>
            )}

            {done && (
              <Link
                to={`/build/${set.code}?seed=${seed}`}
                onClick={(e) => e.stopPropagation()}
                className="aspect-[5/7] rounded-lg border-2 border-ctp-mauve bg-ctp-mauve/10 flex items-center justify-center cursor-pointer hover:bg-ctp-mauve/20 transition-colors"
              >
                <span className="text-ctp-mauve font-semibold">
                  Build deck →
                </span>
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <div
        className="fixed bottom-0 left-72 right-0 h-14 flex items-center justify-between px-6 border-t"
        style={{
          backgroundColor: "#2a1f47",
          borderColor: "#3b2e5a",
        }}
      >
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ctp-text font-medium">{set.name}</span>
          <span className="text-ctp-overlay0">
            Seed: <span className="text-ctp-mauve font-mono">{seed}</span>
          </span>
        </div>
        <div className="text-sm text-ctp-overlay1">
          {packIndex < 6
            ? `Pack ${packIndex + 1} of 6`
            : packIndex === 6
              ? "Promo"
              : "Complete"}
        </div>
      </div>

      <HoverPreview />
    </div>
  );
}
