import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NO_CONNECTION } from "../lib/api";

/** Desk data other desks change too (seats, QRIS payments), refreshed every 30 s and on return to the tab. */
const POLL_MS = 30_000;

export type Polled<T> = {
  value: T | null;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

export function usePolled<T>(enabled: boolean, load: (sessionToken: string | null) => Promise<T>, failure: string): Polled<T> {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const loadRef = useRef(load);
  loadRef.current = load;
  const sequenceRef = useRef(0);
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const id = ++sequenceRef.current;
    try {
      // Clerk refreshes the token over the network; offline that throws.
      const token = await getTokenRef.current().catch(() => {
        throw new Error(NO_CONNECTION);
      });
      const next = await loadRef.current(token);
      if (id !== sequenceRef.current) return; // a newer request owns the state
      setValue(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (caught) {
      if (id === sequenceRef.current) setError(caught instanceof Error ? caught.message : failure);
    }
  }, [failure]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { value, error, updatedAt, refresh };
}
