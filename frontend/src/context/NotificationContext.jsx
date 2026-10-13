import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);
  const timeoutRef = useRef(null);

  const notify = useCallback((type, message) => {
    if (!message) return;
    window.clearTimeout(timeoutRef.current);
    setNotification({ type, message, id: Date.now() });
    timeoutRef.current = window.setTimeout(() => setNotification(null), 5000);
  }, []);

  const closeNotification = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    setNotification(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {notification && (
        <div
          key={notification.id}
          className={`toast-message toast-${notification.type}`}
          role={notification.type === "error" ? "alert" : "status"}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={closeNotification}
          >
            ×
          </button>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const notify = useContext(NotificationContext);
  if (!notify)
    throw new Error(
      "useNotification must be used inside NotificationProvider.",
    );
  return notify;
}

export function usePageNotifications(error, success) {
  const notify = useNotification();

  useEffect(() => {
    if (error) notify("error", error);
  }, [error, notify]);

  useEffect(() => {
    if (success) notify("success", success);
  }, [success, notify]);
}
