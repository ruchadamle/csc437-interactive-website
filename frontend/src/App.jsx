import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { createTheme, deleteTheme, fetchPokemon, fetchThemes } from "./api/themeApi.js";
import SiteHeader from "./components/SiteHeader.jsx";
import { hexToRgba } from "./data/themeUtils.js";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import ThemesPage from "./pages/ThemesPage.jsx";

const TOKEN_STORAGE_KEY = "poke_palette_auth_token";
const USER_STORAGE_KEY = "poke_palette_auth_user";

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [pokemonList, setPokemonList] = useState([]);
  const [themes, setThemes] = useState([]);
  const [searchText, setSearchText] = useState("Pikachu");
  const [currentPokemonKey, setCurrentPokemonKey] = useState("");
  const [authToken, setAuthToken] = useState(() => readSessionValue(TOKEN_STORAGE_KEY));
  const [authUsername, setAuthUsername] = useState(() => readSessionValue(USER_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const isAuthenticated = Boolean(authToken && authUsername);

  const currentPokemon = useMemo(
    () => pokemonList.find((pokemon) => pokemon.key === currentPokemonKey) || pokemonList[0] || null,
    [currentPokemonKey, pokemonList],
  );

  useEffect(() => {
    writeSessionValue(TOKEN_STORAGE_KEY, authToken);
    writeSessionValue(USER_STORAGE_KEY, authUsername);
  }, [authToken, authUsername]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setIsLoading(true);
      setLoadError("");

      try {
        const pokemon = await fetchPokemon();
        if (cancelled) {
          return;
        }

        setPokemonList(pokemon);
        const initialPokemon = pokemon.find((entry) => entry.key === "pikachu") || pokemon[0] || null;
        setCurrentPokemonKey(initialPokemon?.key ?? "");
        setSearchText(initialPokemon?.name ?? "");

        if (!isAuthenticated) {
          setThemes([]);
          return;
        }

        const savedThemes = await fetchThemes(authUsername, authToken);
        if (!cancelled) {
          setThemes(savedThemes);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error.status === 401) {
          clearAuthState();
          setThemes([]);
          setActionError("Your session expired. Please log in again.");
        } else {
          setLoadError(error.message || "Could not load data from server.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, isAuthenticated, authToken, authUsername]);

  useEffect(() => {
    if (!currentPokemon) {
      return;
    }

    const root = document.documentElement;
    root.style.setProperty("--theme-primary", currentPokemon.palette.primary);
    root.style.setProperty("--theme-primary-ink", currentPokemon.palette.text);
    root.style.setProperty("--bloom-1-color", hexToRgba(currentPokemon.palette.primary, 0.22));
    root.style.setProperty("--bloom-2-color", hexToRgba(currentPokemon.palette.accent, 0.16));
  }, [currentPokemon]);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", isDarkMode);
    document.body.classList.toggle("theme-light", !isDarkMode);
  }, [isDarkMode]);

  function clearAuthState() {
    setAuthToken("");
    setAuthUsername("");
    writeSessionValue(TOKEN_STORAGE_KEY, "");
    writeSessionValue(USER_STORAGE_KEY, "");
  }

  function handleAuthSuccess({ token, username }) {
    setAuthToken(token);
    setAuthUsername(username);
    setActionError("");
  }

  function generateTheme() {
    if (pokemonList.length === 0) {
      return;
    }

    const normalized = searchText.trim().toLowerCase();
    const matchedPokemon = pokemonList.find((pokemon) => pokemon.name.toLowerCase() === normalized)
      || pokemonList.find((pokemon) => pokemon.name.toLowerCase().includes(normalized))
      || pokemonList[0];

    setCurrentPokemonKey(matchedPokemon.key);
    setSearchText(matchedPokemon.name);
  }

  async function saveCurrentTheme() {
    if (!currentPokemon) {
      return;
    }

    if (!isAuthenticated) {
      setActionError("Log in to save themes.");
      return;
    }

    const alreadySaved = themes.some((theme) => theme.pokemonKey === currentPokemon.key);
    if (alreadySaved) {
      return;
    }

    setActionError("");
    try {
      const createdTheme = await createTheme(authUsername, currentPokemon.key, authToken);
      if (!createdTheme) {
        setActionError("Server returned an invalid theme payload.");
        return;
      }
      setThemes((prevThemes) => [createdTheme, ...prevThemes]);
    } catch (error) {
      if (error.status === 409 && error.payload?.theme) {
        const existingTheme = error.payload.theme;
        setThemes((prevThemes) => [
          existingTheme,
          ...prevThemes.filter((theme) => theme.pokemonKey !== existingTheme.pokemonKey),
        ]);
        return;
      }
      if (error.status === 401) {
        clearAuthState();
        setActionError("Your session expired. Please log in again.");
        return;
      }
      setActionError(error.message || "Could not save theme.");
    }
  }

  async function removeThemeByKey(pokemonKey) {
    if (!isAuthenticated) {
      setActionError("Log in to remove themes.");
      return;
    }

    setActionError("");
    try {
      await deleteTheme(authUsername, pokemonKey, authToken);
      setThemes((prevThemes) => prevThemes.filter((theme) => theme.pokemonKey !== pokemonKey));
    } catch (error) {
      if (error.status === 404) {
        setThemes((prevThemes) => prevThemes.filter((theme) => theme.pokemonKey !== pokemonKey));
        return;
      }
      if (error.status === 401) {
        clearAuthState();
        setActionError("Your session expired. Please log in again.");
        return;
      }
      setActionError(error.message || "Could not remove theme.");
    }
  }

  return (
    <>
      <SiteHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((value) => !value)}
        isAuthenticated={isAuthenticated}
        username={authUsername}
      />

      {isLoading ? (
        <main id="main" className="container">
          <section className="panel status-panel" role="status" aria-live="polite">
            <h1>Loading...</h1>
            <p className="muted">Fetching Pokemon and saved themes from the server.</p>
          </section>
        </main>
      ) : loadError ? (
        <main id="main" className="container">
          <section className="panel status-panel status-error" role="alert">
            <h1>Could not load data</h1>
            <p>{loadError}</p>
            <button className="btn-primary" type="button" onClick={() => setReloadToken((count) => count + 1)}>
              Retry
            </button>
          </section>
        </main>
      ) : (
        <>
          {actionError && (
            <section className="container status-inline-wrap" role="alert">
              <p className="status-inline-error">{actionError}</p>
            </section>
          )}

          <Routes>
            <Route
              path="/"
              element={(
                <HomePage
                  pokemon={currentPokemon}
                  pokemonOptions={pokemonList}
                  searchText={searchText}
                  onSearchTextChange={setSearchText}
                  onGenerate={generateTheme}
                  onSave={saveCurrentTheme}
                  onRemove={removeThemeByKey}
                  isAuthenticated={isAuthenticated}
                  themes={themes}
                />
              )}
            />
            <Route
              path="/themes"
              element={(
                <ThemesPage
                  themes={themes}
                  onRemove={removeThemeByKey}
                  isAuthenticated={isAuthenticated}
                />
              )}
            />
            <Route
              path="/login"
              element={(
                <LoginPage
                  isAuthenticated={isAuthenticated}
                  username={authUsername}
                  onAuthSuccess={handleAuthSuccess}
                  onLogout={clearAuthState}
                />
              )}
            />
            <Route path="/register" element={<RegisterPage onAuthSuccess={handleAuthSuccess} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      )}
    </>
  );
}

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore sessionStorage write errors.
  }
}
