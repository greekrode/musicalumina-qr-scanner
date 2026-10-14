export const PASS_PREFIX = "ML2:";

/** A festival session and the audience tickets still on sale for it. */
export type SessionSeats = {
  number: number;
  startsAt: string;
  endsAt: string;
  ticketsLeft: number;
};

/** One spot on the running order. */
export type Performance = {
  sessionNumber: number;
  categoryName: string | null;
  subCategoryName: string | null;
  startsAt: string;
  endsAt: string;
  order: number;
  name: string;
};

export type HeldTickets = { sessionNumber: number; quantity: number };

/** Where a scanned pass holder plays and the tickets they hold (scanner_pass_context). */
export type PassContext = {
  eventId: string;
  /** IDR per ticket for QRIS; null when the event takes no QRIS. */
  ticketPrice: number | null;
  /** Teachers buy for any session; participants and performers only for their own. */
  chooseSession: boolean;
  fixedSession: number | null;
  /** Participant/performer: their own spots. Teacher: every student they registered. */
  performances: Performance[];
  sessions: SessionSeats[];
  tickets: HeldTickets[];
};

export type CheckinResult = {
  /** "test": scanned outside the event's days; verified but nothing recorded. */
  status: "checked_in" | "already_checked_in" | "test";
  /** Event days (YYYY-MM-DD, Jakarta) — shown on test scans. */
  eventDays?: string[];
  /** Signed id and reference code both matched the database. */
  verified?: boolean;
  kind: "participant" | "teacher" | "performer";
  checkedInAt: string | null;
  checkedInBy: string;
  registration: {
    id: string;
    name: string | null;
    /** Performer passes: the group entry they perform in (e.g. the duet). */
    entryName?: string | null;
    songTitle: string | null;
    categoryName: string | null;
    subCategoryName: string | null;
    refCode: string | null;
  };
  /** Null when the schedule lookup failed; the check-in itself still counted. */
  context: PassContext | null;
};

export type OverviewEntry = {
  order: number;
  name: string;
  registrationId: string | null;
  /** 2 for a duet, else 1. */
  performers: number;
  checkedIn: number;
  tickets: number;
};

export type OverviewBlock = {
  id: string;
  categoryName: string | null;
  subCategoryName: string | null;
  startsAt: string;
  endsAt: string;
  entries: OverviewEntry[];
};

export type OverviewSession = SessionSeats & {
  /** Scheduled participants × 2 (each brings one guardian). */
  participantPax: number;
  ticketsSold: number;
  blocks: OverviewBlock[];
};

/** The ongoing festival's running order (scanner_event_overview). */
export type Overview = {
  event: { id: string; title: string; seatLimit: number } | null;
  sessions: OverviewSession[];
};

export type SavedTickets = { sessionNumber: number; quantity: number; ticketsLeft: number };

/**
 * A QRIS payment on screen: the QR pays `amount` (price × `quantity` + `uniqueCode`)
 * for `quantity` more tickets. The 1–9 code keeps concurrent QRs of the same price apart.
 */
export type QrisPayment = { paymentId: string; sessionNumber: number; quantity: number; amount: number; uniqueCode: number; expiresAt: string; qrCode: string };

export type PaymentStatus =
  | { status: "pending" | "cancelled" | "expired"; amount: number; expiresAt: string }
  | ({ status: "paid"; amount: number } & SavedTickets);

export const NO_CONNECTION = "No connection. Check Wi-Fi and try again.";

export class ApiError extends Error {
  /** Ticket saves refused for capacity: the most this holder may have. */
  readonly available?: number;
  constructor(message: string, available?: number) {
    super(message);
    this.available = available;
  }
}

async function call<T>(path: string, sessionToken: string | null, fallback: string, body?: object): Promise<T> {
  if (!sessionToken) throw new ApiError("Your session expired. Sign in again.");
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${sessionToken}`, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
      // Venue Wi-Fi: never leave the desk hanging.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(NO_CONNECTION);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof data.error === "string" ? data.error : fallback, typeof data.available === "number" ? data.available : undefined);
  }
  return data; // our own Worker's response (worker/index.ts)
}

export const checkInPass = (pass: string, sessionToken: string | null) =>
  call<CheckinResult>("/api/checkin", sessionToken, "Check-in failed. Try again.", { pass });

export const fetchOverview = (sessionToken: string | null) =>
  call<Overview>("/api/event", sessionToken, "Could not load the schedule.");

/** Set the tickets a pass holds for one session; 0 removes them. */
export const saveTickets = (pass: string, sessionNumber: number | null, quantity: number, sessionToken: string | null) =>
  call<SavedTickets>("/api/tickets", sessionToken, "Could not save the tickets. Try again.", { pass, sessionNumber, quantity });

/** Hold the seats and get a Mayar QR for `quantity` more tickets. */
export const startQrisPayment = (pass: string, sessionNumber: number | null, quantity: number, sessionToken: string | null) =>
  call<QrisPayment>("/api/payments", sessionToken, "Could not start the QRIS payment. Try again.", { pass, sessionNumber, quantity });

/** Has the QR been paid? With `cancel`, a last check, then the QR is dropped. */
export const checkQrisPayment = (paymentId: string, cancel: boolean, sessionToken: string | null) =>
  call<PaymentStatus>("/api/payments/status", sessionToken, "Could not check the payment.", { paymentId, cancel });
