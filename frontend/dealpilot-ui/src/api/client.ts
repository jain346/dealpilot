/* ================================================================
   API CLIENT
   ================================================================ */

import type { ToastSeverity, ResponsePayload } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const storage = {
  token: "dealpilot.token",
  session: "dealpilot.session",
  page: "dealpilot.current_page",
};

export const AUTH_EXPIRED_EVENT = "dealpilot:auth-expired";

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      body.detail || "Something went wrong. Please try again.",
    );
  }
  return body as T;
}

export type ToastApi = {
  show: (severity: ToastSeverity, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

export function toastForError(toast: ToastApi, error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      toast.error("Your session expired — logging you out.");
      return;
    }
    if (error.status === 404) {
      toast.info("This record is no longer available.");
      return;
    }
    if (error.status === 409) {
      toast.warning(error.message);
      return;
    }
    if (error.status >= 500) {
      toast.error(
        "DealPilot could not complete that request. Please try again.",
      );
      return;
    }
  }
  toast.error(
    error instanceof Error ? error.message : fallback,
  );
}

export function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem(storage.token) || ""}`,
  };
}

export function responseText(payload: ResponsePayload | string) {
  return typeof payload === "string"
    ? payload
    : payload.markdown || payload.text || "";
}
