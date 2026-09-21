/* ================================================================
   TOAST CONTEXT
   ================================================================ */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Toast, ToastSeverity } from "../types";
import type { ToastApi } from "../api/client";

const TOAST_ICONS: Record<ToastSeverity, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};
const TOAST_TITLES: Record<ToastSeverity, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

let toastIdCounter = 0;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 250);
  }, []);

  const show = useCallback(
    (severity: ToastSeverity, message: string) => {
      const id = ++toastIdCounter;
      const duration =
        severity === "error" ? 0 : severity === "warning" ? 8000 : 5000;
      setToasts((prev) => {
        const next = [...prev, { id, severity, message, duration }];
        return next.slice(-3); // max 3 visible
      });
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const api: ToastApi = {
    show,
    success: (msg) => show("success", msg),
    error: (msg) => show("error", msg),
    warning: (msg) => show("warning", msg),
    info: (msg) => show("info", msg),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.severity}${t.exiting ? " exiting" : ""}`}
            role="alert"
            style={
              t.duration
                ? ({ "--toast-duration": `${t.duration}ms` } as React.CSSProperties)
                : undefined
            }
          >
            <span className="toast-icon">{TOAST_ICONS[t.severity]}</span>
            <div className="toast-body">
              <span className="toast-title">{TOAST_TITLES[t.severity]}</span>
              <span className="toast-text">{t.message}</span>
            </div>
            <button
              className="toast-dismiss"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
            {t.duration > 0 && <span className="toast-progress" />}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
