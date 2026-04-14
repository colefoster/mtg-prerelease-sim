import type { BasicLands, DeckState, PoolCard } from "../types";

type Color = "W" | "U" | "B" | "R" | "G";
const COLORS: Color[] = ["W", "U", "B", "R", "G"];
const COLOR_NAMES: Record<Color, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export interface AiAnalysis {
  analysis: string;
  colors: {
    primary: Color;
    secondary: Color;
    splash: Color | null;
    reasoning: string;
  };
  mainDeck: string[];
  basics: BasicLands;
  commentary: {
    gameplan: string;
    strengths: string;
    weaknesses: string;
    keyCards: string[];
    mulliganGuide: string;
  };
}

function countPips(manaCost: string): Record<Color, number> {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const m of manaCost.matchAll(/\{([WUBRG])\}/g)) {
    pips[m[1] as Color]++;
  }
  return pips;
}

function isLand(pc: PoolCard): boolean {
  return pc.card.isBasicLand || pc.card.typeLine.toLowerCase().includes("land");
}

function isCreature(pc: PoolCard): boolean {
  return pc.card.typeLine.toLowerCase().includes("creature");
}

function isRemoval(pc: PoolCard): boolean {
  const t = pc.card.oracleText.toLowerCase();
  return (
    t.includes("destroy target") ||
    t.includes("exile target") ||
    t.includes("return target") ||
    /deals? \d+ damage to (target|any|each)/.test(t) ||
    t.includes("fight") ||
    t.includes("-x/-x") ||
    /gets? [+-]\d+\/[+-]\d+ until/.test(t)
  );
}

function isBomb(pc: PoolCard): boolean {
  if (pc.card.rarity === "mythic") return true;
  if (pc.card.rarity === "rare") {
    const t = pc.card.oracleText.toLowerCase();
    // Heuristic: rares with evasion, card advantage, or big effects
    if (
      t.includes("flying") ||
      t.includes("draw") ||
      t.includes("each opponent") ||
      t.includes("all creatures") ||
      t.includes("whenever") ||
      t.includes("token")
    )
      return true;
  }
  return false;
}

function isEvasion(pc: PoolCard): boolean {
  const t = pc.card.oracleText.toLowerCase();
  return (
    t.includes("flying") ||
    t.includes("menace") ||
    t.includes("trample") ||
    t.includes("unblockable") ||
    t.includes("can't be blocked")
  );
}

function cardColors(pc: PoolCard): Color[] {
  if (pc.card.colors.length > 0) return pc.card.colors as Color[];
  // Derive from mana cost
  const pips = countPips(pc.card.manaCost);
  return COLORS.filter((c) => pips[c] > 0);
}

function fitsColors(pc: PoolCard, pair: [Color, Color], splash?: Color): boolean {
  if (isLand(pc)) return true;
  const colors = cardColors(pc);
  if (colors.length === 0) return true; // colorless
  const allowed = new Set<string>([...pair]);
  if (splash) allowed.add(splash);
  return colors.every((c) => allowed.has(c));
}

interface ColorPairEval {
  pair: [Color, Color];
  score: number;
  bombs: PoolCard[];
  removal: PoolCard[];
  creatures: PoolCard[];
  evasion: PoolCard[];
  playables: PoolCard[];
  totalPips: Record<Color, number>;
}

function evaluateColorPair(allCards: PoolCard[], pair: [Color, Color]): ColorPairEval {
  const nonLands = allCards.filter((c) => !isLand(c) && fitsColors(c, pair));
  const bombs = nonLands.filter(isBomb);
  const removal = nonLands.filter(isRemoval);
  const creatures = nonLands.filter(isCreature);
  const evasion = nonLands.filter(isEvasion);

  const totalPips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of nonLands) {
    const pips = countPips(c.card.manaCost);
    for (const color of COLORS) totalPips[color] += pips[color];
  }

  // Score the pair
  let score = 0;
  score += bombs.length * 5;
  score += removal.length * 3;
  score += evasion.length * 1.5;
  score += creatures.length * 0.8;
  score += nonLands.length * 0.3;

  // Curve bonus
  const twos = nonLands.filter((c) => Math.floor(c.card.cmc) === 2).length;
  const threes = nonLands.filter((c) => Math.floor(c.card.cmc) === 3).length;
  score += Math.min(twos, 5) * 0.5;
  score += Math.min(threes, 4) * 0.5;

  // Depth bonus
  if (nonLands.length >= 23) score += 5;
  else if (nonLands.length >= 20) score += 2;
  else score -= (23 - nonLands.length) * 2; // penalty for shallow pools

  // Creature count
  if (creatures.length >= 13) score += 3;
  else if (creatures.length >= 10) score += 1;
  else score -= 2;

  return { pair, score, bombs, removal, creatures, evasion, playables: nonLands, totalPips };
}

function cardPower(pc: PoolCard): number {
  let score = 0;
  switch (pc.card.rarity) {
    case "mythic": score += 5; break;
    case "rare": score += 3.5; break;
    case "uncommon": score += 1.8; break;
    case "common": score += 1; break;
  }
  if (isBomb(pc)) score += 2;
  if (isRemoval(pc)) score += 2;
  if (isEvasion(pc)) score += 1;
  if (isCreature(pc)) score += 0.5;
  return score;
}

function selectMainDeck(playables: PoolCard[], target: number): PoolCard[] {
  const sorted = [...playables].sort((a, b) => cardPower(b) - cardPower(a));

  const selected: PoolCard[] = [];
  const cmcBudget = new Map<number, number>([
    [1, 3], [2, 5], [3, 5], [4, 4], [5, 3], [6, 2],
  ]);

  // Pass 1: fill curve slots
  for (const card of sorted) {
    if (selected.length >= target) break;
    const bucket = Math.min(Math.floor(card.card.cmc), 6);
    const max = cmcBudget.get(bucket) ?? 2;
    const cur = selected.filter((c) => Math.min(Math.floor(c.card.cmc), 6) === bucket).length;
    if (cur < max) selected.push(card);
  }

  // Pass 2: fill remaining with best available
  if (selected.length < target) {
    const ids = new Set(selected.map((c) => c.instanceId));
    for (const card of sorted) {
      if (selected.length >= target) break;
      if (!ids.has(card.instanceId)) selected.push(card);
    }
  }

  return selected.slice(0, target);
}

function suggestBasicsForDeck(main: PoolCard[], targetLands: number): BasicLands {
  let existingLands = 0;
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const pc of main) {
    if (isLand(pc)) { existingLands++; continue; }
    const cp = countPips(pc.card.manaCost);
    for (const c of COLORS) pips[c] += cp[c];
  }

  const need = Math.max(0, targetLands - existingLands);
  const total = Object.values(pips).reduce((a, b) => a + b, 0);
  if (total === 0 || need === 0) return { W: 0, U: 0, B: 0, R: 0, G: 0 };

  const raw: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const result: BasicLands = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const c of COLORS) raw[c] = (pips[c] / total) * need;
  for (const c of COLORS) result[c] = Math.floor(raw[c]);

  let rem = need - COLORS.reduce((s, c) => s + result[c], 0);
  const remainders = COLORS.map((c) => ({ c, r: raw[c] - result[c] })).sort((a, b) => b.r - a.r);
  for (const { c } of remainders) {
    if (rem <= 0) break;
    result[c]++;
    rem--;
  }

  return result;
}

function checkSplash(
  allCards: PoolCard[],
  bestPair: [Color, Color],
): { splash: Color | null; splashCards: PoolCard[]; reason: string } {
  const offColorBombs: { color: Color; card: PoolCard }[] = [];

  for (const pc of allCards) {
    if (isLand(pc)) continue;
    if (fitsColors(pc, bestPair)) continue;
    if (!isBomb(pc) && !isRemoval(pc)) continue;

    const colors = cardColors(pc).filter((c) => !bestPair.includes(c));
    if (colors.length === 1) {
      offColorBombs.push({ color: colors[0], card: pc });
    }
  }

  if (offColorBombs.length === 0) return { splash: null, splashCards: [], reason: "" };

  // Group by color, pick best splash
  const byColor = new Map<Color, PoolCard[]>();
  for (const { color, card } of offColorBombs) {
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color)!.push(card);
  }

  let bestSplash: Color | null = null;
  let bestCards: PoolCard[] = [];
  let bestValue = 0;
  for (const [color, cards] of byColor) {
    const value = cards.reduce((s, c) => s + cardPower(c), 0);
    if (value > bestValue && value >= 5) { // only splash if it's worth it
      bestValue = value;
      bestSplash = color;
      bestCards = cards;
    }
  }

  if (!bestSplash) return { splash: null, splashCards: [], reason: "" };

  const names = bestCards.map((c) => c.card.name).join(", ");
  return {
    splash: bestSplash,
    splashCards: bestCards,
    reason: `Splashing ${COLOR_NAMES[bestSplash]} for ${names}`,
  };
}

export function analyzePool(deck: DeckState): AiAnalysis {
  const allCards = [...deck.zones.pool, ...deck.zones.main, ...deck.zones.side];
  const nonLands = allCards.filter((c) => !isLand(c));

  // Evaluate all 10 color pairs
  const pairs: ColorPairEval[] = [];
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      pairs.push(evaluateColorPair(allCards, [COLORS[i], COLORS[j]]));
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const best = pairs[0];
  const runnerUp = pairs[1];

  // Check for splash
  const { splash, splashCards, reason: splashReason } = checkSplash(allCards, best.pair);

  // Build main deck
  let playables = [...best.playables];
  if (splash) {
    for (const sc of splashCards) {
      if (!playables.find((p) => p.instanceId === sc.instanceId)) {
        playables.push(sc);
      }
    }
  }

  // Add on-color non-basic lands
  const onColorLands = allCards.filter(
    (c) => !c.card.isBasicLand && isLand(c) && fitsColors(c, best.pair, splash ?? undefined),
  );
  const mainSpells = selectMainDeck(
    playables.filter((c) => !isLand(c)),
    23 - onColorLands.length,
  );
  const mainCards = [...mainSpells, ...onColorLands];
  const basics = suggestBasicsForDeck(mainCards, 17);

  // Build commentary
  const allBombs = allCards.filter(isBomb);
  const allRemoval = nonLands.filter(isRemoval);
  const poolCreatures = nonLands.filter(isCreature);

  // Analysis text
  const quality =
    allBombs.length >= 4 ? "excellent" :
    allBombs.length >= 2 ? "solid" :
    allBombs.length === 1 ? "decent" : "below average";
  const analysis = `${quality.charAt(0).toUpperCase() + quality.slice(1)} pool with ${allBombs.length} bomb${allBombs.length !== 1 ? "s" : ""}, ${allRemoval.length} removal spell${allRemoval.length !== 1 ? "s" : ""}, and ${poolCreatures.length} creatures across all colors. ${COLOR_NAMES[best.pair[0]]}-${COLOR_NAMES[best.pair[1]]} is the deepest color pair with ${best.playables.length} playables${runnerUp ? `, ahead of ${COLOR_NAMES[runnerUp.pair[0]]}-${COLOR_NAMES[runnerUp.pair[1]]} (${runnerUp.playables.length})` : ""}.`;

  // Color reasoning
  let reasoning = `${COLOR_NAMES[best.pair[0]]}-${COLOR_NAMES[best.pair[1]]} offers ${best.bombs.length} bombs, ${best.removal.length} removal, and ${best.creatures.length} creatures with a solid curve.`;
  if (splash) reasoning += ` ${splashReason}.`;

  // Gameplan
  const mainCreatures = mainCards.filter(isCreature);
  const mainEvasion = mainCards.filter(isEvasion);
  const avgCmc = mainSpells.reduce((s, c) => s + c.card.cmc, 0) / (mainSpells.length || 1);
  const gameplan = avgCmc <= 2.8
    ? `Aggressive deck averaging ${avgCmc.toFixed(1)} CMC — curve out early and pressure with ${mainCreatures.length} creatures${mainEvasion.length >= 3 ? `, using ${mainEvasion.length} evasive threats to push through` : ""}.`
    : avgCmc <= 3.5
      ? `Midrange deck (${avgCmc.toFixed(1)} avg CMC) that aims to stabilize the board with ${mainCreatures.length} creatures and out-value the opponent with bombs and removal.`
      : `Controlling deck (${avgCmc.toFixed(1)} avg CMC) that plays for the late game — survive early, then take over with powerful threats.`;

  // Strengths
  const strengthParts: string[] = [];
  if (best.bombs.length >= 2) strengthParts.push(`multiple bombs (${best.bombs.map((c) => c.card.name).join(", ")})`);
  if (best.removal.length >= 3) strengthParts.push(`deep removal suite`);
  if (mainEvasion.length >= 3) strengthParts.push(`strong evasion package`);
  if (mainCreatures.length >= 14) strengthParts.push(`excellent creature density`);
  const strengths = strengthParts.length > 0
    ? `Key strengths: ${strengthParts.join(", ")}.`
    : `Reasonable card quality across the board.`;

  // Weaknesses
  const weakParts: string[] = [];
  if (best.removal.length < 2) weakParts.push(`thin on removal (${best.removal.length})`);
  if (mainCreatures.length < 12) weakParts.push(`low creature count (${mainCreatures.length})`);
  if (mainEvasion.length < 2) weakParts.push(`limited evasion to close games`);
  const twos = mainSpells.filter((c) => Math.floor(c.card.cmc) === 2).length;
  if (twos < 3) weakParts.push(`light on 2-drops (${twos})`);
  if (splash) weakParts.push(`splash adds mana inconsistency`);
  const weaknesses = weakParts.length > 0
    ? `Watch out for: ${weakParts.join(", ")}.`
    : `No major weaknesses — solid build overall.`;

  // Key cards
  const keyCards: string[] = [];
  for (const b of best.bombs.slice(0, 3)) {
    const why = b.card.rarity === "mythic" ? "windmill slam bomb" : "powerful rare";
    keyCards.push(`${b.card.name} — ${why}, build around this`);
  }
  for (const r of best.removal.slice(0, 2)) {
    keyCards.push(`${r.card.name} — premium removal, always play this`);
  }
  if (keyCards.length === 0) {
    // Pick best cards by power
    const topCards = [...mainCards].sort((a, b) => cardPower(b) - cardPower(a)).slice(0, 3);
    for (const c of topCards) {
      keyCards.push(`${c.card.name} — one of your best cards`);
    }
  }

  // Mulligan guide
  const mulliganGuide = best.bombs.length > 0
    ? `Keep hands with 2-4 lands and early plays. Mulligan aggressively for ${best.bombs[0].card.name} if your hand is otherwise weak.`
    : `Keep hands with good mana and a curve — prioritize 2-drop into 3-drop openings.`;

  return {
    analysis,
    colors: {
      primary: best.pair[0],
      secondary: best.pair[1],
      splash,
      reasoning,
    },
    mainDeck: mainCards.map((c) => c.card.name),
    basics,
    commentary: {
      gameplan,
      strengths,
      weaknesses,
      keyCards,
      mulliganGuide,
    },
  };
}
