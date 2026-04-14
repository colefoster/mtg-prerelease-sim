#!/usr/bin/env npx tsx
/**
 * Fetches card data from Scryfall for a given set code and writes it to data/<setCode>.json.
 * Also downloads card images locally.
 *
 * Usage: npx tsx scripts/fetch-set.ts <setCode>
 */

import fs from "node:fs";
import path from "node:path";

const SCRYFALL_BASE = "https://api.scryfall.com";
const DELAY_MS = 100; // Scryfall asks for 50-100ms between requests

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  colors?: string[];
  color_identity: string[];
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  layout: string;
  image_uris?: { normal: string };
  card_faces?: Array<{
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text?: string;
    image_uris?: { normal: string };
  }>;
  booster: boolean;
  promo_types?: string[];
  scryfall_uri: string;
}

interface ScryfallList {
  data: ScryfallCard[];
  has_more: boolean;
  next_page?: string;
}

interface ScryfallSet {
  code: string;
  name: string;
  released_at: string;
  icon_svg_uri: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scryfall ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchAllCards(query: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}`;

  while (url) {
    await sleep(DELAY_MS);
    const page = await fetchJson<ScryfallList>(url);
    cards.push(...page.data);
    url = page.has_more && page.next_page ? page.next_page : "";
    if (url) console.log(`  Fetched ${cards.length} cards so far...`);
  }

  return cards;
}

async function downloadImage(
  url: string,
  dest: string,
): Promise<void> {
  if (fs.existsSync(dest)) return; // Skip if already downloaded
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  Failed to download: ${url}`);
    return;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

function transformCard(sc: ScryfallCard) {
  const isBasicLand =
    sc.type_line.toLowerCase().includes("basic") &&
    sc.type_line.toLowerCase().includes("land");

  // Get image URL
  let image = "";
  let backImage: string | undefined;
  if (sc.image_uris?.normal) {
    image = sc.image_uris.normal;
  } else if (sc.card_faces?.[0]?.image_uris?.normal) {
    image = sc.card_faces[0].image_uris.normal;
    if (sc.card_faces[1]?.image_uris?.normal) {
      backImage = sc.card_faces[1].image_uris.normal;
    }
  }

  // Get mana cost
  let manaCost = sc.mana_cost || "";
  if (!manaCost && sc.card_faces) {
    manaCost = sc.card_faces.map((f) => f.mana_cost).join(" // ");
  }

  // Get colors
  let colors = sc.colors || [];
  if (colors.length === 0 && sc.card_faces) {
    const colorSet = new Set<string>();
    for (const face of sc.card_faces) {
      for (const m of (face.mana_cost || "").matchAll(/\{([WUBRG])\}/g)) {
        colorSet.add(m[1]);
      }
    }
    colors = [...colorSet];
  }

  const faces = sc.card_faces?.map((f) => ({
    name: f.name,
    manaCost: f.mana_cost || "",
    typeLine: f.type_line || "",
    oracleText: f.oracle_text || "",
  }));

  return {
    id: sc.id,
    oracleId: sc.oracle_id,
    name: sc.name,
    set: sc.set,
    collectorNumber: sc.collector_number,
    rarity: sc.rarity as "common" | "uncommon" | "rare" | "mythic",
    colors,
    colorIdentity: sc.color_identity,
    manaCost,
    cmc: sc.cmc,
    typeLine: sc.type_line,
    oracleText: sc.oracle_text || "",
    layout: sc.layout,
    image,
    ...(backImage ? { backImage } : {}),
    booster: sc.booster,
    promoTypes: sc.promo_types || [],
    scryfallUri: sc.scryfall_uri,
    isBasicLand,
    ...(faces && faces.length > 1 ? { faces } : {}),
  };
}

async function main() {
  const setCode = process.argv[2]?.toLowerCase();
  if (!setCode) {
    console.error("Usage: npx tsx scripts/fetch-set.ts <setCode>");
    process.exit(1);
  }

  console.log(`Fetching set: ${setCode}`);

  // Fetch set metadata
  await sleep(DELAY_MS);
  const setInfo = await fetchJson<ScryfallSet>(
    `${SCRYFALL_BASE}/sets/${setCode}`,
  );
  console.log(`Set: ${setInfo.name} (${setInfo.code})`);

  // Fetch all cards in set
  console.log("Fetching cards...");
  const allCards = await fetchAllCards(`set:${setCode} unique:prints`);
  console.log(`Total cards fetched: ${allCards.length}`);

  // Fetch prerelease promos
  console.log("Fetching prerelease promos...");
  let promoCards: ScryfallCard[] = [];
  try {
    promoCards = await fetchAllCards(`set:${setCode} is:prerelease`);
    console.log(`Prerelease promos: ${promoCards.length}`);
  } catch {
    console.log("No prerelease promos found");
  }

  // Transform cards
  const cards = allCards.map(transformCard);
  const prereleasePromos = promoCards.map(transformCard);

  // Download images
  const imgDir = path.resolve(
    import.meta.dirname,
    "..",
    "public",
    "cards",
    setCode,
  );
  fs.mkdirSync(imgDir, { recursive: true });
  console.log(`Downloading images to ${imgDir}...`);

  const allTransformed = [...cards, ...prereleasePromos];
  const seen = new Set<string>();

  for (let i = 0; i < allTransformed.length; i++) {
    const card = allTransformed[i];
    if (seen.has(card.id)) continue;
    seen.add(card.id);

    if (card.image) {
      const ext = "jpg";
      const filename = `${card.id}.${ext}`;
      const dest = path.join(imgDir, filename);
      await downloadImage(card.image, dest);
      card.image = `/cards/${setCode}/${filename}`;
      await sleep(50);
    }

    if (card.backImage) {
      const filename = `${card.id}-back.jpg`;
      const dest = path.join(imgDir, filename);
      await downloadImage(card.backImage, dest);
      card.backImage = `/cards/${setCode}/${filename}`;
      await sleep(50);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Downloaded ${i + 1}/${allTransformed.length} images...`);
    }
  }

  // Also update promos to use local paths (they share objects with allTransformed)
  // Already done since we modified in place

  const setData = {
    code: setInfo.code,
    name: setInfo.name,
    releasedAt: setInfo.released_at,
    iconSvgUri: setInfo.icon_svg_uri,
    cards,
    prereleasePromos,
  };

  const outDir = path.resolve(import.meta.dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${setCode}.json`);
  fs.writeFileSync(outPath, JSON.stringify(setData, null, 2));
  console.log(`\nWritten to ${outPath}`);
  console.log(
    `  ${cards.length} cards, ${prereleasePromos.length} prerelease promos`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
