import { getThemesCollection } from "../mongo.js";
import { getPokemonByKey, POKEMON_CATALOG } from "../pokemonCatalog.js";
import { normalizeUsername } from "../providers/CredentialsProvider.js";
import { verifyAuthToken } from "./verifyAuthToken.js";

export function registerThemeRoutes(app) {
  app.get("/api/pokemon", (req, res) => {
    res.json({ pokemon: POKEMON_CATALOG });
  });

  app.get("/api/users/:userId/themes", verifyAuthToken, verifyOwnUserAccess, async (req, res, next) => {
    try {
      const userId = normalizeUsername(req.params.userId);
      const themes = await getThemesCollection().find({ userId }).sort({ createdAt: -1 }).toArray();
      return res.json({ themes: themes.map(formatThemeDocument) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/users/:userId/themes", verifyAuthToken, verifyOwnUserAccess, async (req, res, next) => {
    try {
      const userId = normalizeUsername(req.params.userId);
      const pokemonKey = normalizePokemonKey(req.body?.pokemonKey);

      if (!pokemonKey) {
        return res.status(400).json({ error: "Bad request", message: "pokemonKey is required." });
      }

      const pokemon = getPokemonByKey(pokemonKey);
      if (!pokemon) {
        return res.status(404).json({ error: "Not found", message: "Unknown pokemon key." });
      }

      const now = new Date();
      const themeToInsert = {
        userId,
        pokemonKey: pokemon.key,
        pokemonName: pokemon.name,
        types: pokemon.types,
        dex: pokemon.dex,
        imageSrc: pokemon.imageSrc,
        isFavorite: true,
        palette: pokemon.palette,
        createdAt: now,
        updatedAt: now,
      };

      const collection = getThemesCollection();
      let createdTheme = null;

      try {
        const insertResult = await collection.insertOne(themeToInsert);
        createdTheme = await collection.findOne({ _id: insertResult.insertedId });
      } catch (error) {
        if (error?.code === 11000) {
          const existingTheme = await collection.findOne({ userId, pokemonKey: pokemon.key });
          return res.status(409).json({
            error: "Conflict",
            message: "Theme already exists for this user.",
            theme: formatThemeDocument(existingTheme),
          });
        }
        return next(error);
      }

      return res.status(201).json({ theme: formatThemeDocument(createdTheme) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/users/:userId/themes/:pokemonKey", verifyAuthToken, verifyOwnUserAccess, async (req, res, next) => {
    try {
      const userId = normalizeUsername(req.params.userId);
      const pokemonKey = normalizePokemonKey(req.params.pokemonKey);

      if (!pokemonKey) {
        return res.status(400).json({ error: "Bad request", message: "pokemonKey is required." });
      }

      const deleteResult = await getThemesCollection().deleteOne({ userId, pokemonKey });
      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ error: "Not found", message: "Theme not found." });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });
}

function verifyOwnUserAccess(req, res, next) {
  const requestedUserId = normalizeUsername(req.params.userId);
  if (!requestedUserId) {
    return res.status(400).json({
      error: "Bad request",
      message: "Invalid user id.",
    });
  }

  if (req.userInfo?.username !== requestedUserId) {
    return res.status(403).json({
      error: "Forbidden",
      message: "This token cannot access another user's themes.",
    });
  }

  return next();
}

function normalizePokemonKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function formatThemeDocument(theme) {
  if (!theme) {
    return null;
  }

  return {
    id: theme._id.toString(),
    pokemonKey: theme.pokemonKey,
    pokemonName: theme.pokemonName,
    types: theme.types,
    dex: theme.dex,
    imageSrc: theme.imageSrc,
    isFavorite: Boolean(theme.isFavorite),
    palette: theme.palette,
    createdAt: theme.createdAt instanceof Date ? theme.createdAt.toISOString() : theme.createdAt,
    updatedAt: theme.updatedAt instanceof Date ? theme.updatedAt.toISOString() : theme.updatedAt,
  };
}
