import type { BasicLands, DeckState, PoolCard } from "../types";

type Color = "W" | "U" | "B" | "R" | "G";
const COLORS: Color[] = ["W", "U", "B", "R", "G"];

interface ColorPairScore {
  colors: [Color, Color];
  score: number;
  playables: PoolCard[];
}

function countPips(manaCost: string): Record<Color, number> {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const m of manaCost.matchAll(/\{([WUBRG])\}/g)) {
    pips[m[1] as Color]++;
  }
  return pips;
}

function cardFitsColors(card: PoolCard, pair: [Color, Color]): boolean {
  const tl = card.card.typeLine.toLowerCase();
  if (card.card.isBasicLand || tl.includes("land")) return true;

  // Colorless cards fit any pair
  if (card.card.colors.length === 0) return true;

  // All colors must be in the pair
  return card.card.colors.every((c) => pair.includes(c as Color));
}

function rarityScore(rarity: string): number {
  switch (rarity) {
    case "mythic":
      return 4;
    case "rare":
      return 3;
    case "uncommon":
      return 1.5;
    case "common":
      return 1;
    default:
      return 0.5;
  }
}

function evaluateCard(card: PoolCard): number {
  let score = rarityScore(card.card.rarity);

  // Creatures are generally more valuable in sealed
  const tl = card.card.typeLine.toLowerCase();
  if (tl.includes("creature")) score += 0.5;

  // Removal spells (heuristic: cards that say "destroy", "exile", or "damage" to target)
  const text = card.card.oracleText.toLowerCase();
  if (
    text.includes("destroy target") ||
    text.includes("exile target") ||
    text.match(/deals? \d+ damage to (target|any)/)
  ) {
    score += 1;
  }

  return score;
}

function scoreColorPair(
  pool: PoolCard[],
  pair: [Color, Color],
): ColorPairScore {
  const playables = pool.filter(
    (c) =>
      cardFitsColors(c, pair) &&
      !c.card.isBasicLand &&
      !c.card.typeLine.toLowerCase().includes("land"),
  );

  // Score = sum of individual card scores + bonus for depth
  let score = playables.reduce((sum, c) => sum + evaluateCard(c), 0);

  // Bonus for having enough playables (23 non-land cards is ideal for 40-card sealed)
  if (playables.length >= 23) score += 5;
  else if (playables.length >= 20) score += 2;

  // Curve bonus: reward having cards at 2 and 3 CMC
  const twos = playables.filter((c) => Math.floor(c.card.cmc) === 2).length;
  const threes = playables.filter((c) => Math.floor(c.card.cmc) === 3).length;
  score += Math.min(twos, 5) * 0.3;
  score += Math.min(threes, 4) * 0.3;

  // Creature count bonus
  const creatures = playables.filter((c) =>
    c.card.typeLine.toLowerCase().includes("creature"),
  ).length;
  if (creatures >= 13) score += 3;
  else if (creatures >= 10) score += 1;

  return { colors: pair, score, playables };
}

function selectPlayables(playables: PoolCard[], targetCount: number): PoolCard[] {
  // Sort by evaluation score descending, then by CMC for tiebreaking
  const sorted = [...playables].sort((a, b) => {
    const diff = evaluateCard(b) - evaluateCard(a);
    if (Math.abs(diff) > 0.01) return diff;
    return a.card.cmc - b.card.cmc;
  });

  // Try to build a reasonable curve
  const selected: PoolCard[] = [];
  const cmcSlots = new Map<number, number>([
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 3],
    [5, 2],
  ]);

  // First pass: fill curve slots with best cards
  for (const card of sorted) {
    if (selected.length >= targetCount) break;
    const bucket = Math.min(Math.floor(card.card.cmc), 6);
    const slotMax = cmcSlots.get(bucket) ?? 2;
    const currentInSlot = selected.filter(
      (c) => Math.min(Math.floor(c.card.cmc), 6) === bucket,
    ).length;
    if (currentInSlot < slotMax) {
      selected.push(card);
    }
  }

  // Second pass: fill remaining slots with best remaining
  if (selected.length < targetCount) {
    const selectedIds = new Set(selected.map((c) => c.instanceId));
    for (const card of sorted) {
      if (selected.length >= targetCount) break;
      if (!selectedIds.has(card.instanceId)) {
        selected.push(card);
      }
    }
  }

  return selected.slice(0, targetCount);
}

function suggestBasicsForColors(
  mainCards: PoolCard[],
  targetLands: number,
): BasicLands {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  let existingLands = 0;
  for (const pc of mainCards) {
    const tl = pc.card.typeLine.toLowerCase();
    if (pc.card.isBasicLand || tl.includes("land")) {
      existingLands++;
    } else {
      const cp = countPips(pc.card.manaCost);
      for (const color of COLORS) pips[color] += cp[color];
    }
  }

  const basicsNeeded = Math.max(0, targetLands - existingLands);
  const totalPips = Object.values(pips).reduce((a, b) => a + b, 0);

  if (totalPips === 0 || basicsNeeded === 0) {
    return { W: 0, U: 0, B: 0, R: 0, G: 0 };
  }

  const raw: Record<string, number> = {};
  const floors: Record<string, number> = {};
  let floorsSum = 0;

  for (const color of COLORS) {
    raw[color] = (pips[color] / totalPips) * basicsNeeded;
    floors[color] = Math.floor(raw[color]);
    floorsSum += floors[color];
  }

  let remaining = basicsNeeded - floorsSum;
  const remainders = COLORS.map((c) => ({
    color: c,
    remainder: raw[c] - floors[c],
  })).sort((a, b) => b.remainder - a.remainder);

  const result: BasicLands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const color of COLORS) result[color] = floors[color];
  for (const { color } of remainders) {
    if (remaining <= 0) break;
    result[color]++;
    remaining--;
  }

  return result;
}

export function autoBuild(currentState: DeckState): DeckState {
  // Combine all cards back into a single pool
  const allCards = [
    ...currentState.zones.pool,
    ...currentState.zones.main,
    ...currentState.zones.side,
  ];

  // Score all 2-color pairs
  const pairs: ColorPairScore[] = [];
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      pairs.push(scoreColorPair(allCards, [COLORS[i], COLORS[j]]));
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const best = pairs[0];

  // Select 23 non-land playables for the main deck (40 - 17 lands = 23)
  const targetSpells = 23;
  const mainCards = selectPlayables(best.playables, targetSpells);
  const mainIds = new Set(mainCards.map((c) => c.instanceId));

  // Everything else goes to sideboard
  const sideCards = allCards.filter((c) => !mainIds.has(c.instanceId));

  // Add any on-color lands from pool to main
  const onColorLands = sideCards.filter(
    (c) =>
      !c.card.isBasicLand &&
      c.card.typeLine.toLowerCase().includes("land") &&
      cardFitsColors(c, best.colors),
  );
  for (const land of onColorLands) {
    mainCards.push(land);
    const idx = sideCards.findIndex((c) => c.instanceId === land.instanceId);
    if (idx !== -1) sideCards.splice(idx, 1);
  }

  const basics = suggestBasicsForColors(mainCards, 17);

  return {
    ...currentState,
    zones: {
      pool: [],
      main: mainCards,
      side: sideCards,
    },
    basics,
  };
}
