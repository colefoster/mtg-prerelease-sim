import type {
  BasicLands,
  DeckState,
  DeckStats,
  PoolCard,
  SealedPool,
} from "../types";

const STORAGE_PREFIX = "deck:";

function storageKey(setCode: string, seed: string) {
  return `${STORAGE_PREFIX}${setCode}:${seed}`;
}

export function saveDeck(state: DeckState) {
  localStorage.setItem(
    storageKey(state.setCode, state.seed),
    JSON.stringify(state),
  );
}

export function loadDeck(setCode: string, seed: string): DeckState | null {
  const raw = localStorage.getItem(storageKey(setCode, seed));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteDeck(setCode: string, seed: string) {
  localStorage.removeItem(storageKey(setCode, seed));
}

export function poolFromSealed(pool: SealedPool): PoolCard[] {
  const cards: PoolCard[] = [];
  for (const pack of pool.packs) {
    for (let s = 0; s < pack.cards.length; s++) {
      const pc = pack.cards[s];
      cards.push({
        instanceId: `p${pack.index}-s${s}-${pc.card.id}`,
        card: pc.card,
        foil: pc.foil,
      });
    }
  }
  cards.push({
    instanceId: `promo-${pool.promo.card.id}`,
    card: pool.promo.card,
    foil: pool.promo.foil,
  });
  return cards;
}

export function initDeckState(
  pool: SealedPool,
): DeckState {
  return {
    setCode: pool.setCode,
    seed: pool.seed,
    zones: {
      pool: poolFromSealed(pool),
      main: [],
      side: [],
    },
    basics: { W: 0, U: 0, B: 0, R: 0, G: 0 },
  };
}

export function moveCard(
  state: DeckState,
  instanceId: string,
  targetZone: "pool" | "main" | "side",
): DeckState {
  let card: PoolCard | undefined;
  const zones = { ...state.zones };

  for (const zone of ["pool", "main", "side"] as const) {
    const idx = zones[zone].findIndex((c) => c.instanceId === instanceId);
    if (idx !== -1) {
      card = zones[zone][idx];
      zones[zone] = [...zones[zone].slice(0, idx), ...zones[zone].slice(idx + 1)];
      break;
    }
  }

  if (!card) return state;
  zones[targetZone] = [...zones[targetZone], card];
  return { ...state, zones };
}

function countPips(manaCost: string): Record<string, number> {
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const m of manaCost.matchAll(/\{([WUBRG])\}/g)) {
    pips[m[1]]++;
  }
  return pips;
}

export function computeStats(state: DeckState): DeckStats {
  const basicsTotal = Object.values(state.basics).reduce((a, b) => a + b, 0);
  const mainCards = state.zones.main;

  let landCount = basicsTotal;
  let creature = 0;
  let instant = 0;
  let sorcery = 0;
  let other = 0;
  const curve: Record<string, number> = {};
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const pc of mainCards) {
    const c = pc.card;
    const tl = c.typeLine.toLowerCase();

    if (c.isBasicLand || tl.includes("land")) {
      landCount++;
    } else {
      // Mana curve (non-land only)
      const bucket = c.cmc >= 6 ? "6+" : String(Math.floor(c.cmc));
      curve[bucket] = (curve[bucket] || 0) + 1;

      // Pips
      const cp = countPips(c.manaCost);
      for (const color of ["W", "U", "B", "R", "G"] as const) {
        pips[color] += cp[color];
      }
    }

    // Types
    if (tl.includes("creature")) creature++;
    else if (tl.includes("instant")) instant++;
    else if (tl.includes("sorcery")) sorcery++;
    else other++;
  }

  return {
    total: mainCards.length + basicsTotal,
    landCount,
    spellCount: mainCards.length + basicsTotal - landCount,
    curve,
    pips,
    types: { creature, instant, sorcery, other },
  };
}

export function suggestBasics(state: DeckState): BasicLands {
  const mainCards = state.zones.main;
  let existingLands = 0;

  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const pc of mainCards) {
    const tl = pc.card.typeLine.toLowerCase();
    if (pc.card.isBasicLand || tl.includes("land")) {
      existingLands++;
    } else {
      const cp = countPips(pc.card.manaCost);
      for (const color of ["W", "U", "B", "R", "G"] as const) {
        pips[color] += cp[color];
      }
    }
  }

  const targetLands = 17;
  const basicsNeeded = Math.max(0, targetLands - existingLands);
  const totalPips = Object.values(pips).reduce((a, b) => a + b, 0);

  if (totalPips === 0 || basicsNeeded === 0) {
    return { W: 0, U: 0, B: 0, R: 0, G: 0 };
  }

  // Largest remainder method
  const raw: Record<string, number> = {};
  const floors: Record<string, number> = {};
  let floorsSum = 0;

  for (const color of ["W", "U", "B", "R", "G"] as const) {
    raw[color] = (pips[color] / totalPips) * basicsNeeded;
    floors[color] = Math.floor(raw[color]);
    floorsSum += floors[color];
  }

  let remaining = basicsNeeded - floorsSum;
  const remainders = (["W", "U", "B", "R", "G"] as const)
    .map((c) => ({ color: c, remainder: raw[c] - floors[c] }))
    .sort((a, b) => b.remainder - a.remainder);

  const result: BasicLands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const color of ["W", "U", "B", "R", "G"] as const) {
    result[color] = floors[color];
  }
  for (const { color } of remainders) {
    if (remaining <= 0) break;
    result[color]++;
    remaining--;
  }

  return result;
}

export function exportMtga(state: DeckState): string {
  const lines: string[] = ["Deck"];

  const mainCounts = new Map<string, number>();
  for (const pc of state.zones.main) {
    const name = pc.card.name;
    mainCounts.set(name, (mainCounts.get(name) || 0) + 1);
  }

  // Add basic lands
  const landNames: Record<string, string> = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
  };
  for (const [color, count] of Object.entries(state.basics)) {
    if (count > 0) {
      const name = landNames[color];
      mainCounts.set(name, (mainCounts.get(name) || 0) + count);
    }
  }

  for (const [name, count] of [...mainCounts.entries()].sort()) {
    lines.push(`${count} ${name}`);
  }

  if (state.zones.side.length > 0) {
    lines.push("", "Sideboard");
    const sideCounts = new Map<string, number>();
    for (const pc of state.zones.side) {
      const name = pc.card.name;
      sideCounts.set(name, (sideCounts.get(name) || 0) + 1);
    }
    for (const [name, count] of [...sideCounts.entries()].sort()) {
      lines.push(`${count} ${name}`);
    }
  }

  return lines.join("\n");
}
