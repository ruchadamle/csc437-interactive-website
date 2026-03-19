import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FaUserCircle } from "react-icons/fa";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const ASSET_BASE_URL = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/+$/, "") : "http://localhost:3000";

const POKEBALL_SRC = `${ASSET_BASE_URL}/sprites/items/poke-ball.png`;
const SOLROCK_SRC = `${ASSET_BASE_URL}/sprites/pokemon/versions/generation-v/black-white/338.png`;
const LUNATONE_SRC = `${ASSET_BASE_URL}/sprites/pokemon/versions/generation-v/black-white/337.png`;

export default function SiteHeader({ isDarkMode, onToggleDarkMode, isAuthenticated, username }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="header-left">
          <NavLink className="brand" to="/" aria-label="PokePalette home">
            <img className="brand-logo" src={POKEBALL_SRC} alt="" aria-hidden="true" />
            <span className="brand-text">PokePalette</span>
          </NavLink>

          <div className="dm-toggle-wrap">
            <button
              type="button"
              className={`dm-toggle ${isDarkMode ? "is-dark" : "is-light"}`}
              onClick={onToggleDarkMode}
              aria-label={isDarkMode ? "Toggle light mode" : "Toggle dark mode"}
              title={isDarkMode ? "Toggle light mode" : "Toggle dark mode"}
            >
              <span className="dm-toggle-label" aria-hidden="true">
                {isDarkMode ? "Light mode" : "Dark mode"}
              </span>
              <span className="dm-toggle-thumb" aria-hidden="true">
                <img
                  className="dm-toggle-sprite"
                  src={isDarkMode ? LUNATONE_SRC : SOLROCK_SRC}
                  alt=""
                />
              </span>
            </button>
          </div>
        </div>

        <div className="header-right">
          <nav className="nav nav-desktop" aria-label="Primary navigation">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/themes">My Themes</NavLink>

            <NavLink to="/login" className="account-link">
              <FaUserCircle className="user-icon" aria-hidden="true" />
              <span className="account-text">
                {isAuthenticated ? `Logged in as: ${username}` : "Log in"}
              </span>
            </NavLink>
          </nav>

          <button
            type="button"
            className="nav-menu-btn"
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-primary-nav"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
          >
            <span className="sr-only">{isMobileMenuOpen ? "Close menu" : "Open menu"}</span>
            <span className="nav-menu-icon" aria-hidden="true">
              <span className="nav-menu-line" />
              <span className="nav-menu-line" />
              <span className="nav-menu-line" />
            </span>
          </button>

          {isMobileMenuOpen && (
            <nav id="mobile-primary-nav" className="mobile-nav" aria-label="Mobile navigation">
              <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)}>Home</NavLink>
              <NavLink to="/themes" onClick={() => setIsMobileMenuOpen(false)}>My Themes</NavLink>
              <NavLink to="/login" className="account-link" onClick={() => setIsMobileMenuOpen(false)}>
                <FaUserCircle className="user-icon" aria-hidden="true" />
                <span className="account-text">{isAuthenticated ? `Logged in as: ${username}` : "Log in"}</span>
              </NavLink>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
