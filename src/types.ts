export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
}

export interface Card {
  id: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  rarity: "common" | "uncommon" | "rare" | "mythic";
  colors: string[];
  colorIdentity: string[];
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  layout: string;
  image: string;
  backImage?: string;
  booster: boolean;
  promoTypes: string[];
  scryfallUri: string;
  isBasicLand: boolean;
  faces?: CardFace[];
}

export interface SetData {
  code: string;
  name: string;
  releasedAt: string;
  iconSvgUri: string;
  cards: Card[];
  prereleasePromos: Card[];
}

export interface PackCard {
  card: Card;
  foil: boolean;
  slot:
    | "common"
    | "uncommon"
    | "rare-mythic"
    | "land"
    | "wildcard"
    | "extra"
    | "foil"
    | "promo";
}

export interface Pack {
  index: number;
  cards: PackCard[];
}

export interface SealedPool {
  setCode: string;
  seed: string;
  packs: Pack[];
  promo: PackCard;
}

export interface PoolCard {
  instanceId: string;
  card: Card;
  foil: boolean;
}

export interface BasicLands {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
}

export interface DeckState {
  setCode: string;
  seed: string;
  zones: {
    pool: PoolCard[];
    main: PoolCard[];
    side: PoolCard[];
  };
  basics: BasicLands;
}

export interface DeckStats {
  total: number;
  landCount: number;
  spellCount: number;
  curve: Record<string, number>;
  pips: { W: number; U: number; B: number; R: number; G: number };
  types: {
    creature: number;
    instant: number;
    sorcery: number;
    other: number;
  };
}
