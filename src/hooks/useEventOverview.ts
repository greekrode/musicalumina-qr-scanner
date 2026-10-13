import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOverview, NO_CONNECTION, type Overview } from "../lib/api";

// Other desks sell tickets too; keep the navbar counts fresh.
const POLL_MS = 30_000;

export type EventOverview = {
  overview: Overview | null;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

export function useEventOverview(enabled: boolean): EventOverview {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const sequenceRef = useRef(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const id = ++sequenceRef.current;
    try {
      // Clerk refreshes the token over the network; offline that throws.
      const token = await getTokenRef.current().catch(() => {
        throw new Error(NO_CONNECTION);
      });
      const next = await fetchOverview(token);
      if (id !== sequenceRef.current) return; // a newer request owns the state
      setOverview(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (failure) {
      if (id === sequenceRef.current) setError(failure instanceof Error ? failure.message : "Could not load the schedule.");
    }
  }, []);

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

  return { overview, error, updatedAt, refresh };
}
