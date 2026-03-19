import { getPokeApiCollection } from "../mongo.js";
import { getEnvVar } from "../getEnvVar.js";
import { generateWebsitePaletteFromImage } from "./paletteGenerator.js";
import {
  getGenerationVBlackWhiteSpriteAbsolutePath,
  getGenerationVBlackWhiteSpriteDexNumbers,
  getGenerationVBlackWhiteSpriteRelativePath,
  hasGenerationVBlackWhiteSprite,
} from "../spritePaths.js";

const PALETTE_VERSION = 4;
const SPRITE_VERSION = "gen-v-black-white-local-v2";
const CATALOG_SYNC_CONCURRENCY = 8;
const MISSING_DEX_KEY_PREFIX = "missing-dex-";
const MAX_SUPPORTED_DEX = 10000;
const DEFAULT_BACKEND_ASSET_BASE_URL = `http://localhost:${Number.parseInt(getEnvVar("PORT", false), 10) || 3000}`;
const BACKEND_ASSET_BASE_URL = (getEnvVar("BACKEND_ASSET_BASE_URL", false) ?? DEFAULT_BACKEND_ASSET_BASE_URL)
  .trim()
  .replace(/\/+$/, "");
const DISPLAY_NAME_OVERRIDES_BY_DEX = new Map([
  [32, "Nidoran"],
  [122, "Mr. Mime"],
  [386, "Deoxys"],
  [413, "Wormadam"],
  [487, "Giratina"],
  [550, "Basculin"],
  [555, "Darmanitan"],
  [592, "Frillish"],
  [593, "Jellicent"],
  [641, "Tornadus"],
  [642, "Thundurus"],
  [645, "Landorus"],
  [647, "Keldeo"],
  [648, "Meloetta"],
  [668, "Pyroar"],
  [678, "Meowstic"],
  [681, "Aegislash"],
  [710, "Pumpkaboo"],
  [711, "Gourgeist"],
  [718, "Zygarde"],
  [745, "Lycanroc"],
  [746, "Wishiwashi"],
  [774, "Minior"],
  [778, "Mimikyu"],
  [849, "Toxtricity"],
  [875, "Eiscue"],
  [876, "Indeedee"],
  [877, "Morpeko"],
  [892, "Urshifu"],
  [902, "Basculegion"],
  [905, "Enamorus"],
  [916, "Oinkologne"],
  [925, "Maushold"],
  [931, "Squawkabilly"],
  [964, "Palafin"],
  [978, "Tatsugiri"],
  [982, "Dudunsparce"],
  [984, "Great Tusk"],
  [985, "Scream Tail"],
  [986, "Brute Bonnet"],
  [987, "Flutter Mane"],
  [988, "Slither Wing"],
  [989, "Sandy Shocks"],
  [990, "Iron Treads"],
  [991, "Iron Bundle"],
  [992, "Iron Hands"],
  [993, "Iron Jugulis"],
  [994, "Iron Moth"],
  [995, "Iron Thorns"],
  [1006, "Iron Valiant"],
  [1009, "Walking Wake"],
  [1010, "Iron Leaves"],
  [1020, "Gouging Fire"],
  [1021, "Raging Bolt"],
  [1022, "Iron Boulder"],
  [1023, "Iron Crown"],
]);
const DISPLAY_NAME_OVERRIDES_BY_KEY = new Map([
  ["meloetta-aria", "Meloetta"],
  ["meloetta-pirouette", "Meloetta"],
]);

export class PokeApiProvider {
  async getPokemonCatalog() {
    const collection = getPokeApiCollection();
    await collection.deleteMany({ dex: { $gt: MAX_SUPPORTED_DEX } });
    const targetDexNumbers = getGenerationVBlackWhiteSpriteDexNumbers()
      .filter((dex) => dex <= MAX_SUPPORTED_DEX);

    if (targetDexNumbers.length === 0) {
      const existing = (await collection.find({}).sort({ dex: 1, key: 1 }).toArray())
        .filter(isUsablePokemonDocument)
        .map(formatPokemonDocument);
      return existing;
    }

    await this.syncCatalogByDexNumbers(targetDexNumbers, collection);
    const refreshed = await collection.find({}).sort({ dex: 1, key: 1 }).toArray();
    return refreshed.filter(isUsablePokemonDocument).map(formatPokemonDocument);
  }

  async getPokemonByKey(pokemonKey) {
    const normalizedKey = normalizePokemonKey(pokemonKey);
    if (!normalizedKey) {
      return null;
    }

    const collection = getPokeApiCollection();
    const existing = await collection.findOne({ key: normalizedKey });
    if (isUsablePokemonDocument(existing)) {
      return formatPokemonDocument(existing);
    }

    return this.fetchAndStorePokemon(normalizedKey);
  }

  async fetchAndStorePokemon(pokemonKey) {
    const normalizedKey = normalizePokemonKey(pokemonKey);
    if (!normalizedKey) {
      return null;
    }

    return this.fetchAndStorePokemonByIdentifier(normalizedKey);
  }

  async syncCatalogByDexNumbers(targetDexNumbers, collection) {
    const knownDexNumbers = await getKnownDexNumbers(collection, targetDexNumbers);
    const missingDexNumbers = targetDexNumbers.filter((dex) => !knownDexNumbers.has(dex));
    if (missingDexNumbers.length === 0) {
      return;
    }

    await runWithConcurrency(
      missingDexNumbers,
      CATALOG_SYNC_CONCURRENCY,
      async (dex) => {
        try {
          await this.fetchAndStorePokemonByIdentifier(String(dex), { missingDex: dex });
        } catch (error) {
          console.warn(`Failed to sync Pokemon dex ${dex}`, error);
        }
      },
    );
  }

  async fetchAndStorePokemonByIdentifier(identifier, options = {}) {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(identifier)}`);
    if (response.status === 404) {
      if (Number.isInteger(options.missingDex)) {
        await markDexUnavailable(options.missingDex);
      }
      return null;
    }
    if (!response.ok) {
      throw new Error(`PokeAPI request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const dex = Number(payload?.id);
    if (!Number.isInteger(dex) || dex <= 0 || dex > MAX_SUPPORTED_DEX) {
      if (Number.isInteger(options.missingDex)) {
        await markDexUnavailable(options.missingDex);
      }
      return null;
    }
    const pokemon = await buildPokemonDocumentFromPayload(payload);
    await upsertPokemonDocument(pokemon);
    return pokemon;
  }
}

function normalizePokemonKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function formatPokemonDocument(document) {
  const dex = Number(document.dex);
  return {
    key: document.key,
    name: getDisplayPokemonName(document.key, dex, document.name),
    types: document.types,
    dex,
    imageSrc: document.imageSrc,
    spriteVersion: document.spriteVersion ?? null,
    palette: document.palette,
    paletteVersion: document.paletteVersion ?? null,
  };
}

function isUsablePokemonDocument(document) {
  return Boolean(
    document
    && typeof document.key === "string"
    && typeof document.name === "string"
    && Array.isArray(document.types)
    && typeof document.dex === "number"
    && document.dex > 0
    && document.dex <= MAX_SUPPORTED_DEX
    && typeof document.imageSrc === "string"
    && document.imageSrc.length > 0
    && document.spriteVersion === SPRITE_VERSION
    && typeof document.palette === "object"
    && document.palette
    && document.paletteVersion === PALETTE_VERSION
  );
}

function getPreferredSprite(payload) {
  const dex = readDexNumberFromPayload(payload);
  const localRelativePath = getGenerationVBlackWhiteSpriteRelativePath(dex);
  const localFilePath = getGenerationVBlackWhiteSpriteAbsolutePath(dex);
  const remoteFallback = payload.sprites?.versions?.["generation-v"]?.["black-white"]?.front_default
    || payload.sprites?.versions?.["generation-v"]?.["black-white"]?.animated?.front_default
    || payload.sprites?.front_default
    || payload.sprites?.other?.["official-artwork"]?.front_default
    || "";

  if (hasGenerationVBlackWhiteSprite(dex)) {
    return {
      publicUrl: `${BACKEND_ASSET_BASE_URL}${localRelativePath}`,
      paletteSource: localFilePath,
    };
  }

  return {
    publicUrl: remoteFallback,
    paletteSource: remoteFallback,
  };
}

function readDexNumberFromPayload(payload) {
  const dex = Number(payload?.id);
  if (!Number.isInteger(dex) || dex <= 0 || dex > MAX_SUPPORTED_DEX) {
    throw new Error("PokeAPI payload is missing a valid dex number.");
  }
  return dex;
}

function readTypesFromPayload(payload) {
  if (!Array.isArray(payload?.types) || payload.types.length === 0) {
    throw new Error("PokeAPI payload is missing Pokemon types.");
  }

  const types = payload.types
    .slice()
    .sort((a, b) => (Number(a?.slot) || 0) - (Number(b?.slot) || 0))
    .map((entry) => capitalize(entry?.type?.name ?? ""))
    .filter(Boolean);

  if (types.length === 0) {
    throw new Error("PokeAPI payload contains invalid Pokemon types.");
  }

  return types;
}

function capitalize(value) {
  if (!value) {
    return "";
  }
  return value[0].toUpperCase() + value.slice(1);
}

async function buildPokemonDocumentFromPayload(payload) {
  const dex = readDexNumberFromPayload(payload);
  const types = readTypesFromPayload(payload);
  const sprite = getPreferredSprite(payload);
  const palette = await generateWebsitePaletteFromImage(sprite.paletteSource);

  return {
    key: payload.name,
    name: getDisplayPokemonName(payload.name, dex, capitalize(payload.name)),
    types,
    dex,
    imageSrc: sprite.publicUrl,
    spriteVersion: SPRITE_VERSION,
    palette,
    paletteVersion: PALETTE_VERSION,
    unavailable: false,
    updatedAt: new Date(),
  };
}

async function upsertPokemonDocument(pokemon) {
  const collection = getPokeApiCollection();
  await collection.updateOne(
    { key: pokemon.key },
    {
      $set: pokemon,
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

async function markDexUnavailable(dex) {
  const collection = getPokeApiCollection();
  await collection.updateOne(
    { key: `${MISSING_DEX_KEY_PREFIX}${dex}` },
    {
      $set: {
        key: `${MISSING_DEX_KEY_PREFIX}${dex}`,
        name: "",
        dex,
        spriteVersion: SPRITE_VERSION,
        unavailable: true,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

async function getKnownDexNumbers(collection, targetDexNumbers) {
  const docs = await collection
    .find(
      {
        spriteVersion: SPRITE_VERSION,
        dex: { $in: targetDexNumbers },
      },
      {
        projection: {
          _id: 0,
          dex: 1,
          key: 1,
          name: 1,
          types: 1,
          imageSrc: 1,
          spriteVersion: 1,
          palette: 1,
          paletteVersion: 1,
          unavailable: 1,
        },
      },
    )
    .toArray();

  const known = new Set();
  for (const document of docs) {
    if (!Number.isInteger(document.dex)) {
      continue;
    }

    if (document.unavailable === true) {
      known.add(document.dex);
      continue;
    }

    if (isUsablePokemonDocument(document)) {
      known.add(document.dex);
    }
  }

  return known;
}

async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) {
    return;
  }

  const chunkSize = Math.max(1, concurrency);
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await Promise.all(chunk.map((item) => worker(item)));
  }
}

function getDisplayPokemonName(key, dex, fallbackName) {
  const normalizedKey = normalizePokemonKey(key);
  const keyOverride = DISPLAY_NAME_OVERRIDES_BY_KEY.get(normalizedKey);
  if (keyOverride) {
    return keyOverride;
  }

  const dexOverride = DISPLAY_NAME_OVERRIDES_BY_DEX.get(dex);
  if (dexOverride) {
    return dexOverride;
  }

  if (typeof fallbackName === "string" && fallbackName.trim().length > 0) {
    return fallbackName;
  }

  return capitalize(normalizedKey);
}
