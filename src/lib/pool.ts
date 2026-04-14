import type { Card, Pack, PackCard, SealedPool, SetData } from "../types";
import { createRng, pickN, pickOne, weightedPick } from "./rng";

function bucketCards(cards: Card[]) {
  const common: Card[] = [];
  const uncommon: Card[] = [];
  const rare: Card[] = [];
  const mythic: Card[] = [];
  const basicLand: Card[] = [];

  for (const card of cards) {
    if (!card.booster) continue;
    if (card.isBasicLand) {
      basicLand.push(card);
      continue;
    }
    switch (card.rarity) {
      case "common":
        common.push(card);
        break;
      case "uncommon":
        uncommon.push(card);
        break;
      case "rare":
        rare.push(card);
        break;
      case "mythic":
        mythic.push(card);
        break;
    }
  }

  return { common, uncommon, rare, mythic, basicLand };
}

function pickByWeightedRarity(
  rng: () => number,
  buckets: ReturnType<typeof bucketCards>,
): Card {
  const rarity = weightedPick<"common" | "uncommon" | "rare" | "mythic">(rng, [
    ["common", 60],
    ["uncommon", 30],
    ["rare", 9],
    ["mythic", 1],
  ]);
  const pool = buckets[rarity];
  if (pool.length > 0) return pickOne(rng, pool);
  // fallback
  for (const r of ["common", "uncommon", "rare", "mythic"] as const) {
    if (buckets[r].length > 0) return pickOne(rng, buckets[r]);
  }
  throw new Error("No cards available");
}

function generatePack(
  rng: () => number,
  buckets: ReturnType<typeof bucketCards>,
  index: number,
): Pack {
  const cards: PackCard[] = [];

  // 6 commons
  for (const card of pickN(rng, buckets.common, 6)) {
    cards.push({ card, foil: false, slot: "common" });
  }

  // 3 uncommons
  for (const card of pickN(rng, buckets.uncommon, 3)) {
    cards.push({ card, foil: false, slot: "uncommon" });
  }

  // 1 rare/mythic (2/15 chance of mythic)
  const isMythic = rng() < 2 / 15;
  const rmPool = isMythic ? buckets.mythic : buckets.rare;
  const rmFallback = isMythic ? buckets.rare : buckets.mythic;
  const rmCard =
    rmPool.length > 0
      ? pickOne(rng, rmPool)
      : rmFallback.length > 0
        ? pickOne(rng, rmFallback)
        : pickOne(rng, buckets.uncommon);
  cards.push({ card: rmCard, foil: false, slot: "rare-mythic" });

  // 1 basic land
  if (buckets.basicLand.length > 0) {
    cards.push({
      card: pickOne(rng, buckets.basicLand),
      foil: false,
      slot: "land",
    });
  }

  // 1 wildcard
  cards.push({ card: pickByWeightedRarity(rng, buckets), foil: false, slot: "wildcard" });

  // 1 extra
  cards.push({ card: pickByWeightedRarity(rng, buckets), foil: false, slot: "extra" });

  // 1 foil
  cards.push({ card: pickByWeightedRarity(rng, buckets), foil: true, slot: "foil" });

  return { index, cards };
}

export function generateSealedPool(
  setData: SetData,
  seed: string,
): SealedPool {
  const rng = createRng(seed, setData.code);
  const buckets = bucketCards(setData.cards);

  const packs: Pack[] = [];
  for (let i = 0; i < 6; i++) {
    packs.push(generatePack(rng, buckets, i));
  }

  // Promo
  const raresAndMythics = [...buckets.rare, ...buckets.mythic];
  const usePromos =
    setData.prereleasePromos.length >= raresAndMythics.length / 2;
  const promoCard = usePromos
    ? pickOne(rng, setData.prereleasePromos)
    : raresAndMythics.length > 0
      ? pickOne(rng, raresAndMythics)
      : pickOne(rng, setData.cards);

  return {
    setCode: setData.code,
    seed,
    packs,
    promo: { card: promoCard, foil: true, slot: "promo" },
  };
}
