import axios from "axios";
import { clearSavedSession, TOKEN_KEY } from "../context/authStorage.js";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5127/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Convert a backend-relative file path into an image URL on the API server.
export function getAssetUrl(filePath) {
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const apiBase = api.defaults.baseURL.replace(/\/api\/?$/, "/");
  return new URL(filePath, apiBase).toString();
}

// Keep token handling in one place so every protected API request uses the same JWT.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message;
    const isExpiredSession = [
      "Invalid or expired token.",
      "Authentication required.",
      "This account is not active.",
    ].includes(message);
    if (
      error.response?.status === 401 &&
      error.config?.headers?.Authorization &&
      isExpiredSession
    ) {
      clearSavedSession();
      if (window.location.pathname !== "/login")
        window.location.assign("/login");
    }
    if (
      error.response?.status === 403 &&
      message ===
        "Your school account is currently suspended. Please contact the school administrator."
    ) {
      clearSavedSession();
      if (window.location.pathname !== "/login")
        window.location.assign("/login");
    }
    if (
      error.response?.status === 403 &&
      message === "You must change your password before continuing."
    ) {
      try {
        const savedUser = JSON.parse(
          localStorage.getItem("schoolms_user") || "null",
        );
        if (savedUser)
          localStorage.setItem(
            "schoolms_user",
            JSON.stringify({ ...savedUser, mustChangePassword: true }),
          );
      } catch {
        // The backend remains authoritative if saved display state cannot be read.
      }
      if (window.location.pathname !== "/change-password")
        window.location.assign("/change-password");
    }
    return Promise.reject(error);
  },
);

export function getApiError(error) {
  return (
    error.response?.data?.message ||
    error.message ||
    "The request could not be completed."
  );
}

export default api;
