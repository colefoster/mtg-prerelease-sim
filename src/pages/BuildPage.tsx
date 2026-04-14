import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getSet } from "../lib/sets";
import { generateSealedPool } from "../lib/pool";
import { generateSeed } from "../lib/rng";
import {
  computeStats,
  deleteDeck,
  exportMtga,
  initDeckState,
  loadDeck,
  moveCard,
  saveDeck,
  suggestBasics,
} from "../lib/deck";
import { autoBuild } from "../lib/autobuilder";
import type { BasicLands, Card, DeckState, PoolCard } from "../types";
import { AiPanel } from "../components/AiPanel";
import { DraggableCard } from "../components/DraggableCard";
import { DropZone } from "../components/DropZone";
import { HoverPreview } from "../components/HoverPreview";

type GroupMode = "color" | "cmc" | "type" | "rarity";

const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C", "L"];
const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  M: "Multicolor",
  C: "Colorless",
  L: "Lands",
};

function getColorGroup(card: Card): string {
  if (card.isBasicLand || card.typeLine.toLowerCase().includes("land"))
    return "L";
  if (card.colors.length > 1) return "M";
  if (card.colors.length === 1) return card.colors[0];
  return "C";
}

function groupCards(
  cards: PoolCard[],
  mode: GroupMode,
): [string, PoolCard[]][] {
  const groups = new Map<string, PoolCard[]>();

  for (const pc of cards) {
    let key: string;
    switch (mode) {
      case "color":
        key = getColorGroup(pc.card);
        break;
      case "cmc":
        key = pc.card.cmc >= 6 ? "6+" : String(Math.floor(pc.card.cmc));
        break;
      case "type": {
        const tl = pc.card.typeLine.toLowerCase();
        if (tl.includes("creature")) key = "Creatures";
        else if (tl.includes("planeswalker")) key = "Planeswalkers";
        else if (tl.includes("instant")) key = "Instants";
        else if (tl.includes("sorcery")) key = "Sorceries";
        else if (tl.includes("enchantment")) key = "Enchantments";
        else if (tl.includes("artifact")) key = "Artifacts";
        else if (tl.includes("land")) key = "Lands";
        else key = "Other";
        break;
      }
      case "rarity":
        key =
          pc.card.rarity.charAt(0).toUpperCase() + pc.card.rarity.slice(1);
        break;
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pc);
  }

  // Sort groups
  let sortedKeys: string[];
  if (mode === "color") {
    sortedKeys = COLOR_ORDER.filter((k) => groups.has(k));
  } else if (mode === "cmc") {
    sortedKeys = [...groups.keys()].sort((a, b) => {
      const na = a === "6+" ? 6 : Number(a);
      const nb = b === "6+" ? 6 : Number(b);
      return na - nb;
    });
  } else if (mode === "rarity") {
    const order = ["Mythic", "Rare", "Uncommon", "Common"];
    sortedKeys = order.filter((k) => groups.has(k));
    for (const k of groups.keys()) {
      if (!sortedKeys.includes(k)) sortedKeys.push(k);
    }
  } else {
    sortedKeys = [...groups.keys()].sort();
  }

  return sortedKeys.map((k) => [
    mode === "color" ? COLOR_LABELS[k] || k : k,
    groups.get(k)!,
  ]);
}

const PIP_COLORS: Record<string, string> = {
  W: "bg-ctp-yellow text-ctp-crust",
  U: "bg-ctp-blue text-ctp-crust",
  B: "bg-ctp-overlay0 text-ctp-crust",
  R: "bg-ctp-red text-ctp-crust",
  G: "bg-ctp-green text-ctp-crust",
};

const LAND_NAMES: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export function BuildPage() {
  const { setCode } = useParams<{ setCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const seed = searchParams.get("seed") || "";
  const set = setCode ? getSet(setCode) : undefined;

  const pool = useMemo(
    () => (set && seed ? generateSealedPool(set, seed) : null),
    [set, seed],
  );

  const [deck, setDeck] = useState<DeckState | null>(() => {
    if (!setCode || !seed) return null;
    const saved = loadDeck(setCode, seed);
    if (saved) return saved;
    if (!pool) return null;
    return initDeckState(pool);
  });

  // Re-init when pool changes
  useEffect(() => {
    if (pool && !deck) {
      const saved = loadDeck(pool.setCode, pool.seed);
      setDeck(saved || initDeckState(pool));
    }
  }, [pool, deck]);

  // Auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!deck) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDeck(deck), 400);
    return () => clearTimeout(saveTimer.current);
  }, [deck]);

  const [groupMode, setGroupMode] = useState<GroupMode>("color");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const stats = useMemo(() => (deck ? computeStats(deck) : null), [deck]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!deck || !event.over) return;
      const instanceId = event.active.id as string;
      const target = event.over.id as "pool" | "main" | "side";
      setDeck(moveCard(deck, instanceId, target));
    },
    [deck],
  );

  const setBasics = useCallback(
    (basics: BasicLands) => {
      if (!deck) return;
      setDeck({ ...deck, basics });
    },
    [deck],
  );

  const handleSuggestBasics = useCallback(() => {
    if (!deck) return;
    setDeck({ ...deck, basics: suggestBasics(deck) });
  }, [deck]);

  const handleExport = useCallback(() => {
    if (!deck) return;
    navigator.clipboard.writeText(exportMtga(deck));
  }, [deck]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
  }, []);

  const handleAutoBuild = useCallback(() => {
    if (!deck) return;
    setDeck(autoBuild(deck));
  }, [deck]);

  const handleAiBuild = useCallback(
    (mainNames: string[], basics: BasicLands) => {
      if (!deck) return;
      const allCards = [
        ...deck.zones.pool,
        ...deck.zones.main,
        ...deck.zones.side,
      ];
      const mainCards: PoolCard[] = [];
      const remaining = [...allCards];

      for (const name of mainNames) {
        const idx = remaining.findIndex(
          (c) => c.card.name.toLowerCase() === name.toLowerCase(),
        );
        if (idx !== -1) {
          mainCards.push(remaining[idx]);
          remaining.splice(idx, 1);
        }
      }

      setDeck({
        ...deck,
        zones: { pool: [], main: mainCards, side: remaining },
        basics,
      });
    },
    [deck],
  );

  const handleNewPacks = useCallback(() => {
    if (!set || !seed) return;
    if (!confirm("Open 6 new packs? This will discard your current deck."))
      return;
    deleteDeck(set.code, seed);
    navigate(`/open/${set.code}?seed=${generateSeed()}`);
  }, [set, seed, navigate]);

  if (!set || !pool || !deck || !stats) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-ctp-overlay0">
          <p>Loading...</p>
          <Link to="/" className="text-ctp-mauve">← Back to sets</Link>
        </div>
      </div>
    );
  }

  const poolGroups = groupCards(deck.zones.pool, groupMode);
  const maxCurve = Math.max(...Object.values(stats.curve), 1);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="min-h-screen flex flex-col">
        {/* Stats bar */}
        <div className="sticky top-0 z-40 bg-ctp-mantle border-b border-ctp-surface0 px-6 py-3">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Card count */}
            <div className="flex items-center gap-2">
              <span
                className={`text-2xl font-bold ${
                  stats.total === 40 ? "text-ctp-green" : "text-ctp-red"
                }`}
              >
                {stats.total}
              </span>
              <span className="text-ctp-overlay0 text-sm">/40 cards</span>
            </div>

            <div className="text-sm text-ctp-overlay1">
              {stats.spellCount} spells · {stats.landCount} lands
            </div>

            {/* Mana curve */}
            <div className="flex items-end gap-0.5 h-8">
              {["0", "1", "2", "3", "4", "5", "6+"].map((bucket) => {
                const count = stats.curve[bucket] || 0;
                const height = count > 0 ? (count / maxCurve) * 100 : 0;
                return (
                  <div key={bucket} className="flex flex-col items-center w-6">
                    <div
                      className="w-4 bg-ctp-mauve rounded-t"
                      style={{ height: `${height}%`, minHeight: count > 0 ? 4 : 0 }}
                    />
                    <span className="text-[10px] text-ctp-overlay0 mt-0.5">
                      {bucket}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pips */}
            <div className="flex gap-1">
              {(["W", "U", "B", "R", "G"] as const).map(
                (color) =>
                  stats.pips[color] > 0 && (
                    <span
                      key={color}
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${PIP_COLORS[color]}`}
                    >
                      {stats.pips[color]}
                    </span>
                  ),
              )}
            </div>

            {/* Types */}
            <div className="text-xs text-ctp-overlay0 flex gap-2">
              {stats.types.creature > 0 && (
                <span>{stats.types.creature} creatures</span>
              )}
              {stats.types.instant > 0 && (
                <span>{stats.types.instant} instants</span>
              )}
              {stats.types.sorcery > 0 && (
                <span>{stats.types.sorcery} sorceries</span>
              )}
              {stats.types.other > 0 && (
                <span>{stats.types.other} other</span>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleAutoBuild}
                className="text-xs px-3 py-1.5 rounded bg-ctp-mauve/20 hover:bg-ctp-mauve/30 text-ctp-mauve font-medium"
              >
                Auto-build
              </button>
              <button
                onClick={handleCopyUrl}
                className="text-xs px-3 py-1.5 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text"
              >
                Copy URL
              </button>
              <button
                onClick={handleExport}
                className="text-xs px-3 py-1.5 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text"
              >
                Export
              </button>
              <button
                onClick={handleNewPacks}
                className="text-xs px-3 py-1.5 rounded bg-ctp-red/20 hover:bg-ctp-red/30 text-ctp-red"
              >
                Open 6 new packs
              </button>
              <Link
                to={`/open/${set.code}?seed=${seed}`}
                className="text-xs px-3 py-1.5 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text"
              >
                Opening
              </Link>
              <Link
                to="/"
                className="text-xs px-3 py-1.5 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text"
              >
                Sets
              </Link>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex-1 grid lg:grid-cols-[1.4fr_1fr] gap-6 p-6">
          {/* Pool */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-ctp-text">Pool</h2>
              <span className="text-sm text-ctp-overlay0">
                ({deck.zones.pool.length})
              </span>
              <div className="flex-1" />
              {(["color", "cmc", "type", "rarity"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGroupMode(mode)}
                  className={`text-xs px-2 py-1 rounded capitalize ${
                    groupMode === mode
                      ? "bg-ctp-mauve text-ctp-crust"
                      : "bg-ctp-surface0 text-ctp-overlay1 hover:text-ctp-text"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <DropZone id="pool" label="">
              {poolGroups.map(([label, cards]) => (
                <div key={label} className="mb-4">
                  <h3 className="text-sm font-medium text-ctp-overlay1 mb-2">
                    {label}{" "}
                    <span className="text-ctp-overlay0">({cards.length})</span>
                  </h3>
                  <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                    {cards.map((pc) => (
                      <DraggableCard key={pc.instanceId} poolCard={pc} />
                    ))}
                  </div>
                </div>
              ))}
              {deck.zones.pool.length === 0 && (
                <p className="text-ctp-overlay0 text-sm py-8 text-center">
                  All cards assigned
                </p>
              )}
            </DropZone>
          </div>

          {/* Deck + Side + Basics */}
          <div className="space-y-6">
            {/* Main deck */}
            <DropZone
              id="main"
              label={`Main Deck (${deck.zones.main.length})`}
            >
              <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
                {deck.zones.main.map((pc) => (
                  <DraggableCard key={pc.instanceId} poolCard={pc} />
                ))}
              </div>
              {deck.zones.main.length === 0 && (
                <p className="text-ctp-overlay0 text-sm py-8 text-center">
                  Drag cards here
                </p>
              )}
            </DropZone>

            {/* Basic lands */}
            <div className="bg-ctp-mantle rounded-xl border border-ctp-surface0 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-ctp-text">
                  Basic Lands
                </h3>
                <button
                  onClick={handleSuggestBasics}
                  className="text-xs px-2 py-1 rounded bg-ctp-mauve/20 text-ctp-mauve hover:bg-ctp-mauve/30"
                >
                  Suggest
                </button>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {(["W", "U", "B", "R", "G"] as const).map((color) => (
                  <div key={color} className="text-center">
                    <p className="text-xs text-ctp-overlay1 mb-1">
                      {LAND_NAMES[color]}
                    </p>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          if (deck.basics[color] > 0) {
                            setBasics({
                              ...deck.basics,
                              [color]: deck.basics[color] - 1,
                            });
                          }
                        }}
                        className="w-6 h-6 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text text-sm flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm font-medium text-ctp-text">
                        {deck.basics[color]}
                      </span>
                      <button
                        onClick={() =>
                          setBasics({
                            ...deck.basics,
                            [color]: deck.basics[color] + 1,
                          })
                        }
                        className="w-6 h-6 rounded bg-ctp-surface0 hover:bg-ctp-surface1 text-ctp-text text-sm flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis */}
            <AiPanel
              deck={deck}
              setName={set.name}
              onApplyBuild={handleAiBuild}
            />

            {/* Sideboard */}
            <DropZone
              id="side"
              label={`Sideboard (${deck.zones.side.length})`}
            >
              <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
                {deck.zones.side.map((pc) => (
                  <DraggableCard key={pc.instanceId} poolCard={pc} />
                ))}
              </div>
              {deck.zones.side.length === 0 && (
                <p className="text-ctp-overlay0 text-sm py-4 text-center">
                  Sideboard
                </p>
              )}
            </DropZone>
          </div>
        </div>
      </div>

      <HoverPreview />
    </DndContext>
  );
}
