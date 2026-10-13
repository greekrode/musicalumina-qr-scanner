import type { SessionSeats } from "./api";

const JAKARTA_CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

/** "09:40" in venue time (WIB), whatever the device's timezone. */
export const clock = (iso: string) => JAKARTA_CLOCK.format(new Date(iso));

/** The session on stage now, else the next one; null once the day is over. */
export function currentSessionNumber(sessions: SessionSeats[], now = Date.now()): number | null {
  const next = sessions.find((session) => new Date(session.endsAt).getTime() >= now);
  return next?.number ?? null;
}

export const ticketsWord = (count: number) => (count === 1 ? "ticket" : "tickets");
