import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context.js";
import { clearSavedSession, TOKEN_KEY, USER_KEY } from "./authStorage.js";
import api from "../services/api.js";

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(readSavedUser);
  const [isCheckingSession, setIsCheckingSession] = useState(() =>
    Boolean(localStorage.getItem(TOKEN_KEY)),
  );

  const saveSession = useCallback((nextToken, nextUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearSavedSession();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) return;

    // Ask the backend to validate saved tokens and return the current account data after refresh.
    api
      .get("/users/me")
      .then(({ data }) => {
        const currentUser = { ...data.user, id: data.user.id || data.user._id };
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
        setUser(currentUser);
      })
      .catch(() => {
        clearSavedSession();
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsCheckingSession(false));
  }, [token]);

  const login = useCallback(
    async (credentials) => {
      const { data } = await api.post("/users/login", credentials);
      saveSession(data.token, data.user);
      return data.user;
    },
    [saveSession],
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const { data } = await api.post("/users/change-password", {
        currentPassword,
        newPassword,
      });
      saveSession(data.token, data.user);
      return data.user;
    },
    [saveSession],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      isCheckingSession,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      changePassword,
    }),
    [token, user, isCheckingSession, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
