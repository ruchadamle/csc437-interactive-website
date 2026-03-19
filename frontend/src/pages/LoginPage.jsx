import React, { useState } from "react";
import { Link } from "react-router-dom";
import { loginUser } from "../api/authApi.js";

export default function LoginPage({
  isAuthenticated,
  username,
  onAuthSuccess,
  onLogout,
}) {
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [loginError, setLoginError] = useState("");

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setIsWorking(true);
    setLoginError("");

    try {
      const payload = await loginUser({
        username: loginUsername,
        password: loginPassword,
      });

      onAuthSuccess({
        token: payload.token,
        username: payload.username || loginUsername.trim().toLowerCase(),
      });
      setLoginPassword("");
    } catch (error) {
      setLoginError(error.message || "Login failed.");
    } finally {
      setIsWorking(false);
    }
  }

  if (isAuthenticated) {
    return (
      <main id="main" className="container auth-page">
        <section className="panel auth-card">
          <h1>Logged in as: {username}</h1>
          <button className="btn-primary auth-logout-btn" type="button" onClick={onLogout}>
            Log out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main id="main" className="container auth-page">
      <section className="panel auth-card">
        <h1>Log in</h1>

        <form className="form auth-form" onSubmit={handleLoginSubmit}>
          <div>
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
          </div>

          <button className="btn-primary auth-login-btn" type="submit" disabled={isWorking}>
            {isWorking ? "Logging in..." : "Log in"}
          </button>
        </form>

        {loginError && <p className="status-inline-error auth-inline-error">{loginError}</p>}

        <p className="auth-footer-link">
          Don&apos;t have an account? <Link to="/register">Register here.</Link>
        </p>
      </section>
    </main>
  );
}
