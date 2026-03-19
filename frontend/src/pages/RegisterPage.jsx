import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser, registerUser } from "../api/authApi.js";

export default function RegisterPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [registerError, setRegisterError] = useState("");

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setRegisterError("");

    if (password !== confirmPassword) {
      setRegisterError("Passwords do not match.");
      return;
    }

    setIsWorking(true);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      await registerUser({
        username: normalizedUsername,
        password,
      });
      const loginPayload = await loginUser({
        username: normalizedUsername,
        password,
      });
      onAuthSuccess?.({
        token: loginPayload.token,
        username: loginPayload.username || normalizedUsername,
      });
      navigate("/");
    } catch (error) {
      setRegisterError(error.message || "Registration failed.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main id="main" className="container auth-page">
      <section className="panel auth-card">
        <h1>Register</h1>

        <form className="form auth-form" onSubmit={handleRegisterSubmit}>
          <div>
            <label htmlFor="register-username">Username</label>
            <input
              id="register-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="register-confirm">Confirm password</label>
            <input
              id="register-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={isWorking}>
            {isWorking ? "Creating..." : "Sign up"}
          </button>
        </form>

        {registerError && <p className="status-inline-error auth-inline-error">{registerError}</p>}

        <p className="auth-footer-link">
          Already have an account? <Link to="/login">Log in here.</Link>
        </p>
      </section>
    </main>
  );
}
