import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getSet } from "../lib/sets";
import { generateSealedPool } from "../lib/pool";
import { generateSeed } from "../lib/rng";
import { FlipCard } from "../components/FlipCard";
import { HoverPreview, showPreview, hidePreview } from "../components/HoverPreview";
import type { PackCard, SealedPool } from "../types";

const REVEAL_DELAY = 220;

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

/* ── Sidebar ── */
interface SidebarEntry {
  key: string;
  label: string;
  state: "pending" | "current" | "done";
  rare?: PackCard;
  uncommons: PackCard[];
  caption: string;
}

function PackFan({ rare, uncommons }: { rare: PackCard; uncommons: PackCard[] }) {
  const cardW = Math.round(100 / 0.7); // ~143px (5:7 ratio at 200px height)
  const offset = 22;
  const items = [
    ...uncommons.map((pc, i) => ({ pc, order: i + 1 })),
    { pc: rare, order: 0 },
  ];
  const totalW = cardW + offset * uncommons.length;

  return (
    <div className="relative mx-auto" style={{ height: "200px", width: `${totalW}px` }}>
      {items.map(({ pc, order }) => {
        const isRare = order === 0;
        return (
          <div
            key={`${pc.card.id}-${order}`}
            className={`absolute top-0 overflow-hidden rounded ring-1 ring-ctp-crust/60 ${isRare ? "shadow-lg" : ""}`}
            style={{
              height: "200px",
              width: `${cardW}px`,
              left: `${order * offset}px`,
              zIndex: 20 - order,
            }}
            onMouseEnter={(e) => showPreview(pc.card.image, e.clientX, e.clientY)}
            onMouseMove={(e) => showPreview(pc.card.image, e.clientX, e.clientY)}
            onMouseLeave={() => hidePreview()}
            title={pc.card.name}
          >
            <img src={pc.card.image} alt={pc.card.name} className="h-full w-full object-cover" />
          </div>
        );
      })}
    </div>
  );
}

function Sidebar({
  pool,
  currentIdx,
  revealedCount,
  currentTotal,
}: {
  pool: SealedPool;
  currentIdx: number;
  revealedCount: number;
  currentTotal: number;
}) {
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIdx]);

  const totalCards = pool.packs.reduce((s, p) => s + p.cards.length, 0) + 1;
  const totalRevealed =
    pool.packs.slice(0, currentIdx).reduce((s, p) => s + p.cards.length, 0) +
    (currentIdx === 6 ? totalCards - 1 : 0) +
    (currentIdx <= 6 ? Math.min(revealedCount, currentTotal) : 0);

  const entries: SidebarEntry[] = pool.packs.map((pack, i) => {
    if (i < currentIdx) {
      const sorted = sortPackCards(pack.cards);
      const rare = sorted.find((c) => c.slot === "rare-mythic" || c.slot === "foil");
      const uncommons = sorted.filter((c) => c.slot === "uncommon");
      return {
        key: `pk-${i}`,
        label: `Pack ${i + 1}`,
        state: "done",
        rare,
        uncommons,
        caption: `${pack.cards.length} cards in pool`,
      };
    }
    if (i === currentIdx) {
      return {
        key: `pk-${i}`,
        label: `Pack ${i + 1}`,
        state: "current",
        uncommons: [],
        caption: `${revealedCount}/${currentTotal} revealed`,
      };
    }
    return {
      key: `pk-${i}`,
      label: `Pack ${i + 1}`,
      state: "pending",
      uncommons: [],
      caption: "sealed",
    };
  });

  // Promo entry
  const promoState =
    currentIdx === 6
      ? revealedCount >= 1
        ? "done"
        : "current"
      : currentIdx > 6
        ? "done"
        : "pending";
  entries.push({
    key: "promo",
    label: "Promo",
    state: promoState,
    rare: promoState === "done" ? pool.promo : undefined,
    uncommons: [],
    caption: "Stamped foil",
  });

  return (
    <aside className="sticky top-4 h-[calc(100vh-2rem)] w-72 shrink-0 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-3">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ctp-subtext0">
          Prerelease kit
        </h2>
        <span className="text-[11px] text-ctp-overlay1">
          <span className="font-semibold text-ctp-text">{totalRevealed}</span>
          <span>/{totalCards}</span>
        </span>
      </header>
      <div className="flex h-[calc(100%-1.75rem)] flex-col gap-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const isCurrent = entry.state === "current";
          return (
            <div
              key={entry.key}
              ref={isCurrent ? currentRef : undefined}
              className={`rounded-md border p-2 transition ${
                entry.state === "current"
                  ? "border-ctp-mauve bg-ctp-mauve/10 ring-1 ring-ctp-mauve/40"
                  : entry.state === "done"
                    ? "border-ctp-green/60 bg-ctp-green/5"
                    : "border-ctp-surface0 bg-ctp-base/40 opacity-60"
              }`}
            >
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <span
                    className={
                      entry.state === "current"
                        ? "text-ctp-mauve"
                        : entry.state === "done"
                          ? "text-ctp-green"
                          : "text-ctp-overlay1"
                    }
                  >
                    {entry.state === "done" ? "✓" : entry.state === "current" ? "●" : "·"}
                  </span>
                  <span className={entry.key === "promo" ? "text-ctp-peach" : "text-ctp-subtext1"}>
                    {entry.label}
                  </span>
                </span>
                <span className="text-[10px] font-normal normal-case text-ctp-overlay1">
                  {entry.caption}
                </span>
              </div>
              {entry.rare ? (
                <PackFan rare={entry.rare} uncommons={entry.uncommons} />
              ) : (
                <div className="flex h-[140px] items-center justify-center rounded bg-ctp-surface0/40 text-xs text-ctp-overlay0">
                  {entry.state === "current" ? "opening…" : "?"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ── Skip/Next button tile ── */
function SkipNextTile({
  fullyRevealed,
  isFinal,
  isPromoPack,
  revealedCount,
  total,
  onSkip,
  onNext,
}: {
  fullyRevealed: boolean;
  isFinal: boolean;
  isPromoPack: boolean;
  revealedCount: number;
  total: number;
  onSkip: () => void;
  onNext: () => void;
}) {
  const label = fullyRevealed
    ? isFinal
      ? "Build deck →"
      : isPromoPack
        ? "Reveal promo →"
        : "Next pack →"
    : "Skip";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        fullyRevealed ? onNext() : onSkip();
      }}
      className={`group relative flex aspect-[5/7] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed p-3 text-center transition ${
        fullyRevealed
          ? "border-ctp-mauve bg-ctp-mauve/10 hover:bg-ctp-mauve/20"
          : "border-ctp-surface1 bg-ctp-surface0/40 hover:bg-ctp-surface0/70"
      }`}
    >
      <span
        className={`text-base font-semibold leading-tight ${
          fullyRevealed ? "text-ctp-mauve" : "text-ctp-subtext1"
        }`}
      >
        {label}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-ctp-overlay1">
        {fullyRevealed ? "click or space" : `${revealedCount}/${total} revealed`}
      </span>
      {fullyRevealed && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ctp-mauve/0 via-ctp-mauve/5 to-ctp-mauve/10 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

/* ── Main page ── */
export function OpenPage() {
  const { setCode = "sos" } = useParams<{ setCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const set = getSet(setCode);
  const seed = searchParams.get("seed");

  useEffect(() => {
    if (set && !seed) {
      navigate(`/open/${setCode}?seed=${generateSeed()}`, { replace: true });
    }
  }, [set, seed, setCode, navigate]);

  const pool = useMemo(
    () => (set && seed ? generateSealedPool(set, seed) : null),
    [set, seed],
  );

  const [packIndex, setPackIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [large, setLarge] = useState(
    () => localStorage.getItem("openPage.largeCards") !== "0",
  );

  useEffect(() => {
    localStorage.setItem("openPage.largeCards", large ? "1" : "0");
  }, [large]);

  // Reset on seed/set change
  useEffect(() => {
    setPackIndex(0);
    setRevealedCount(0);
  }, [seed, setCode]);

  const currentPack = useMemo(() => {
    if (!pool) return null;
    if (packIndex < 6) return { index: packIndex, cards: sortPackCards(pool.packs[packIndex].cards) };
    if (packIndex === 6) return { index: 6, cards: [pool.promo] };
    return null;
  }, [pool, packIndex]);

  const totalCards = currentPack?.cards.length ?? 0;
  const fullyRevealed = totalCards > 0 && revealedCount >= totalCards;
  const isPromoPack = packIndex === 6;
  const isFinal = isPromoPack && fullyRevealed;

  // Auto-reveal timer
  useEffect(() => {
    if (!currentPack || fullyRevealed) return;
    const timer = setTimeout(() => {
      setRevealedCount((c) => Math.min(c + 1, totalCards));
    }, REVEAL_DELAY);
    return () => clearTimeout(timer);
  }, [currentPack, revealedCount, fullyRevealed, totalCards]);

  const skip = useCallback(() => {
    setRevealedCount(totalCards);
  }, [totalCards]);

  const next = useCallback(() => {
    if (!pool || !seed) return;
    if (packIndex < 6) {
      setPackIndex((p) => p + 1);
      setRevealedCount(0);
    } else {
      navigate(`/build/${setCode}?seed=${seed}`);
    }
  }, [pool, packIndex, setCode, seed, navigate]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        fullyRevealed ? next() : skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullyRevealed, skip, next]);

  if (!set) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-ctp-overlay0 text-center">
          <p>Set <span className="text-ctp-red">{setCode}</span> not found.</p>
          <Link to="/" className="text-ctp-mauve hover:text-ctp-lavender mt-4 inline-block">← Back to sets</Link>
        </div>
      </div>
    );
  }

  if (!seed || !pool || !currentPack) return (
    <div className="p-8 text-ctp-subtext0">Loading…</div>
  );

  return (
    <div
      className="min-h-screen px-4 pt-3 pb-16"
      onClick={() => { if (!fullyRevealed) skip(); }}
    >
      <div className="flex gap-4">
        {/* Main content (left) */}
        <div className="min-w-0 flex-1">
          <section
            className={`grid gap-3 ${
              large
                ? "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
                : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))]"
            }`}
          >
            {currentPack.cards.map((pc, i) => (
              <div key={`${packIndex}-${i}-${pc.card.id}`} className="relative">
                <FlipCard
                  packCard={pc}
                  revealed={i < revealedCount}
                  large={large}
                />
                {isPromoPack && i < revealedCount && (
                  <span className="pointer-events-none absolute left-2 top-2 rounded bg-ctp-peach px-2 py-0.5 text-xs font-bold text-ctp-base shadow">
                    PROMO · FOIL
                  </span>
                )}
              </div>
            ))}
            <SkipNextTile
              fullyRevealed={fullyRevealed}
              isFinal={isFinal}
              isPromoPack={isPromoPack}
              revealedCount={revealedCount}
              total={totalCards}
              onSkip={skip}
              onNext={next}
            />
          </section>

          {/* Footer bar */}
          <footer className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#3b2e5a] bg-[#2a1f47] px-4 py-2 text-sm text-ctp-text">
            <Link
              to="/"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-ctp-text hover:text-ctp-mauve"
              title="Back to set picker"
            >
              ← {set.name}
              <span className="ml-1 text-ctp-overlay1">Prerelease</span>
            </Link>
            <span className="text-ctp-subtext0">
              {isPromoPack ? "Prerelease Promo" : `Pack ${packIndex + 1} / 6`}
            </span>
            <span className="text-xs text-ctp-overlay1">seed: {seed}</span>
            <span className="text-xs text-ctp-overlay1">
              Click or Space to {fullyRevealed ? "advance" : "skip"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex overflow-hidden rounded bg-ctp-surface0 text-xs">
                <button
                  className={`px-2 py-1 ${large ? "bg-ctp-surface2 text-ctp-text" : "text-ctp-subtext0 hover:bg-ctp-surface1"}`}
                  onClick={(e) => { e.stopPropagation(); setLarge(true); }}
                  title="Large cards"
                >
                  Large
                </button>
                <button
                  className={`px-2 py-1 ${!large ? "bg-ctp-surface2 text-ctp-text" : "text-ctp-subtext0 hover:bg-ctp-surface1"}`}
                  onClick={(e) => { e.stopPropagation(); setLarge(false); }}
                  title="Small cards with hover preview"
                >
                  Small
                </button>
              </div>
              <button
                className="rounded bg-ctp-surface0 px-3 py-1 text-xs text-ctp-text hover:bg-ctp-surface1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/open/${setCode}?seed=${generateSeed()}`, { replace: true });
                }}
              >
                Re-roll
              </button>
            </div>
          </footer>
        </div>

        {/* Sidebar (right) */}
        <Sidebar
          pool={pool}
          currentIdx={packIndex}
          revealedCount={revealedCount}
          currentTotal={totalCards}
        />
      </div>

      <HoverPreview />
    </div>
  );
}
