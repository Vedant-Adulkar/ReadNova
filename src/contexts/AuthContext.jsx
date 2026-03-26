/**
 * src/contexts/AuthContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides authentication state to the whole app:
 *  - user        : full user object (or null if logged out)
 *  - token       : JWT string (persisted in localStorage)
 *  - loading     : true while rehydrating from localStorage
 *  - login()     : call /api/auth/login, store token, set user
 *  - register()  : call /api/auth/register, store token, set user
 *  - logout()    : clear token + user state
 *  - updateUser(): merge updates into user state (e.g. after preference quiz)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { post, get } from "@/lib/apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  // ── On mount: rehydrate user from stored token ─────────────────────────────
  useEffect(() => {
    const rehydrate = async () => {
      const storedToken = localStorage.getItem("token");
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const data = await get("/auth/me");
        setUser(data.user);
        setToken(storedToken);
      } catch {
        // Token invalid / expired — clear it
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    rehydrate();
  }, []); // Run ONLY once on mount

  // ── Persist token whenever it changes ─────────────────────────────────────
  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  // ── register ───────────────────────────────────────────────────────────────
  const register = useCallback(async ({ name, email, password, age }) => {
    const data = await post("/auth/register", { name, email, password, age });
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  // ── login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const data = await post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // ── updateUser (shallow merge) ─────────────────────────────────────────────
  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  // ── updateProfilePicture — optimistic avatar update (no refetch) ───────────
  // Call this immediately after a successful /api/upload/profile response.
  const updateProfilePicture = useCallback((url) => {
    setUser((prev) => ({ ...prev, profilePicture: url }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser, updateProfilePicture }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
