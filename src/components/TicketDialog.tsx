import { useAuth } from "@clerk/clerk-react";
import { CheckCircle2, Loader2, Minus, Plus, QrCode, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  checkQrisPayment,
  NO_CONNECTION,
  saveTickets,
  startQrisPayment,
  type PassContext,
  type QrisPayment,
  type SavedTickets,
} from "../lib/api";
import { clock, currentSessionNumber, ticketsWord } from "../lib/schedule";
import QrisCode from "./QrisCode";

const idr = (amount: number) => `IDR ${amount.toLocaleString("en-US")}`;

/**
 * Buy or edit the audience tickets a scanned pass holds for one session.
 * The count can never exceed what is free plus what the holder already has;
 * the server enforces the same limit for concurrent desks.
 *
 * With a ticket price set, extra tickets can be paid by QRIS: the dialog shows
 * the Mayar QR and checks every second until the payment lands, then the
 * server adds the tickets.
 */
export default function TicketDialog({
  pass,
  holderName,
  context,
  onClose,
  onSaved,
}: {
  pass: string;
  holderName: string;
  context: PassContext;
  onClose: () => void;
  onSaved: (saved: SavedTickets) => void;
}) {
  const { getToken } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const held = (session: number | null) => context.tickets.find((t) => t.sessionNumber === session)?.quantity ?? 0;
  const [sessionNumber, setSessionNumber] = useState<number | null>(
    () => context.fixedSession ?? context.tickets[0]?.sessionNumber ?? currentSessionNumber(context.sessions) ?? context.sessions[0]?.number ?? null,
  );
  // Seats free per session as last reported (updated when a save is refused).
  const [free, setFree] = useState<Record<number, number>>(() => Object.fromEntries(context.sessions.map((s) => [s.number, s.ticketsLeft])));
  // Editing starts from what they hold; a new purchase from 1, or 0 when the session is full.
  const startValue = (session: number | null) => String(held(session) || (session !== null && (free[session] ?? 0) > 0 ? 1 : 0));
  const [value, setValue] = useState(() => startValue(sessionNumber));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // QRIS: the QR on screen, and the tickets it paid for once it lands.
  const [payment, setPayment] = useState<QrisPayment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paid, setPaid] = useState<(SavedTickets & { amount: number; added: number }) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const waiting = payment !== null && paid === null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const token = () =>
    getToken().catch(() => {
      throw new ApiError(NO_CONNECTION);
    });

  // Poll the payment every second while its QR is on screen.
  useEffect(() => {
    if (!payment || paid || cancelling) return;
    let stopped = false;
    let timer: number;
    const poll = async () => {
      try {
        const result = await checkQrisPayment(payment.paymentId, false, await token());
        if (stopped) return;
        setError(null);
        if (result.status === "paid") {
          onSaved(result);
          setPaid({ ...result, added: payment.quantity });
          return;
        }
        if (result.status !== "pending") {
          setPayment(null);
          setError(result.status === "expired" ? "The QR expired before a payment arrived. Start a new one." : "That QR was cancelled.");
          return;
        }
      } catch (failure) {
        // Venue Wi-Fi drops: keep trying; the server settles whenever it gets through.
        if (stopped) return;
        setError(failure instanceof Error ? failure.message : "Could not check the payment.");
      }
      setNow(Date.now());
      timer = window.setTimeout(poll, 1000);
    };
    timer = window.setTimeout(poll, 1000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // getToken/onSaved are stable for the life of one payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, paid, cancelling]);

  const current = held(sessionNumber);
  const max = sessionNumber === null ? 0 : (free[sessionNumber] ?? 0) + current;
  const quantity = value === "" ? 0 : Number(value);
  const valid = Number.isInteger(quantity) && quantity >= 0 && quantity <= max && (current > 0 || quantity > 0);
  const left = Math.max(0, max - (valid ? quantity : current));
  const session = context.sessions.find((s) => s.number === sessionNumber);
  const extra = valid ? quantity - current : 0;
  const qrisAmount = context.ticketPrice && sessionNumber !== null && extra > 0 ? context.ticketPrice * extra : null;

  const set = (next: number) => {
    setError(null);
    setValue(String(Math.min(Math.max(next, 0), max)));
  };

  const pickSession = (next: number) => {
    setSessionNumber(next);
    setError(null);
    setValue(startValue(next));
  };

  /** A refused purchase says how many this holder may have; clamp to it. */
  const showRefusal = (failure: unknown, fallback: string) => {
    if (failure instanceof ApiError && failure.available !== undefined && sessionNumber !== null) {
      const available = failure.available;
      setFree((prev) => ({ ...prev, [sessionNumber]: Math.max(0, available - current) }));
      setValue(String(Math.min(quantity, available)));
    }
    setError(failure instanceof Error ? failure.message : fallback);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving || sessionNumber === null) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveTickets(pass, sessionNumber, quantity, await token()));
      onClose();
    } catch (failure) {
      showRefusal(failure, "Could not save the tickets. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const payWithQris = async () => {
    if (qrisAmount === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const started = await startQrisPayment(pass, sessionNumber, extra, await token());
      setNow(Date.now());
      setPayment(started);
    } catch (failure) {
      showRefusal(failure, "Could not start the QRIS payment. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Last check, then drop the QR; a payment that landed meanwhile still counts.
  const cancelPayment = async () => {
    if (!payment || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await checkQrisPayment(payment.paymentId, true, await token());
      if (result.status === "paid") {
        onSaved(result);
        setPaid({ ...result, added: payment.quantity });
      } else {
        setPayment(null);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not cancel the payment. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  const secondsLeft = payment ? Math.max(0, Math.round((Date.parse(payment.expiresAt) - now) / 1000)) : 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // An unpaid QR must be cancelled explicitly, never dismissed by accident.
      onCancel={(event) => waiting && event.preventDefault()}
      onClick={(event) => !waiting && event.target === dialogRef.current && dialogRef.current?.close()}
      className="w-[calc(100%-2rem)] max-w-sm border border-rule-hairline border-t-2 border-t-marigold bg-surface-elevated p-0 text-ink-body backdrop:bg-burgundy-700/50"
    >
      {paid ? (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-status-open-fg" aria-hidden />
          <p className="type-label mt-3 text-status-open-fg">Payment received</p>
          <p className="mt-1 font-serif text-[1.75rem] tabular-nums text-ink-primary">{idr(paid.amount)}</p>
          <p className="mt-2 text-[0.9375rem] text-ink-body">
            {holderName} now holds {paid.quantity} {ticketsWord(paid.quantity)} for Session {paid.sessionNumber}
            <span className="text-ink-muted"> (+{paid.added})</span>.
          </p>
          <button type="button" className="btn-primary mt-6 w-full" onClick={() => dialogRef.current?.close()} autoFocus>
            Done
          </button>
        </div>
      ) : payment ? (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="type-label text-ink-accent">Pay with QRIS</p>
              <h2 className="mt-1 truncate text-[1.375rem]">{holderName}</h2>
            </div>
          </div>
          <p className="mt-4 text-center font-serif text-[1.75rem] tabular-nums text-ink-primary">{idr(payment.amount)}</p>
          <p className="text-center text-[0.875rem] text-ink-muted">
            {payment.quantity} {ticketsWord(payment.quantity)} · Session {payment.sessionNumber} · includes unique code +{payment.uniqueCode}
          </p>
          <div className="mx-auto mt-4 max-w-[280px] border border-rule-hairline">
            <QrisCode value={payment.qrCode} label={`QRIS for ${idr(payment.amount)}`} />
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-[0.9375rem] tabular-nums text-ink-primary" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-marigold" aria-hidden />
            Waiting for payment · {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>

          {error && <p className="mt-4 bg-status-error-bg px-3 py-2 text-[0.875rem] text-status-error-fg">{error}</p>}

          <button type="button" className="btn-outline mt-6 w-full" onClick={cancelPayment} disabled={cancelling}>
            {cancelling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Cancel payment
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="type-label text-ink-accent">{current > 0 ? "Edit tickets" : "Buy ticket"}</p>
              <h2 className="mt-1 truncate text-[1.375rem]">{holderName}</h2>
            </div>
            <button type="button" className="-mr-2 -mt-1 p-2 text-ink-muted hover:text-burgundy" onClick={() => dialogRef.current?.close()} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          {context.chooseSession ? (
            <label className="mt-5 block">
              <span className="type-label text-ink-muted">Session</span>
              <select
                value={sessionNumber ?? ""}
                onChange={(event) => pickSession(Number(event.target.value))}
                className="mt-1.5 h-11 w-full rounded-sm border border-rule-subtle bg-surface-elevated px-3 text-[0.9375rem] text-ink-primary focus:border-marigold"
              >
                {context.sessions.map((s) => (
                  <option key={s.number} value={s.number}>
                    Session {s.number} · {clock(s.startsAt)}–{clock(s.endsAt)} · {free[s.number] ?? 0} left
                    {held(s.number) ? ` · holds ${held(s.number)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            session && (
              <p className="mt-5 text-[0.9375rem] text-ink-primary">
                Session {session.number} <span className="tabular-nums text-ink-muted">· {clock(session.startsAt)}–{clock(session.endsAt)}</span>
              </p>
            )
          )}

          <div className="mt-5">
            <label htmlFor="ticket-quantity" className="type-label text-ink-muted">
              Tickets
            </label>
            <div className="mt-1.5 flex items-stretch gap-2">
              <button type="button" className="btn-outline h-12 w-12 px-0" onClick={() => set(quantity - 1)} disabled={quantity <= 0} aria-label="One less">
                <Minus className="h-4 w-4" />
              </button>
              <input
                id="ticket-quantity"
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                step={1}
                value={value}
                autoFocus
                onFocus={(event) => event.target.select()}
                onChange={(event) => {
                  setError(null);
                  const raw = event.target.value.replace(/\D/g, "");
                  // Never more than the session allows.
                  setValue(raw === "" ? "" : String(Math.min(Number(raw), max)));
                }}
                className="h-12 min-w-0 flex-1 rounded-sm border border-rule-subtle bg-surface-elevated text-center font-serif text-[1.5rem] tabular-nums text-ink-primary [appearance:textfield] focus:border-marigold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button type="button" className="btn-outline h-12 w-12 px-0" onClick={() => set(quantity + 1)} disabled={quantity >= max} aria-label="One more">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className={`mt-2 text-[0.875rem] tabular-nums ${left === 0 ? "text-status-error-fg" : "text-ink-muted"}`}>
              {max === 0 ? "This session is full." : `${left} ${ticketsWord(left)} left in this session after this · max ${max}`}
            </p>
            {current > 0 && <p className="mt-1 text-[0.8125rem] text-ink-subtle">Currently holds {current}. Set 0 to remove them.</p>}
          </div>

          {error && <p className="mt-4 bg-status-error-bg px-3 py-2 text-[0.875rem] text-status-error-fg">{error}</p>}

          <button type="submit" className="btn-primary mt-6 w-full" disabled={!valid || saving || quantity === current}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {current > 0
              ? quantity === 0
                ? "Remove tickets"
                : "Save"
              : `Buy ${valid ? quantity : ""} ${ticketsWord(quantity)}`}
          </button>
          {qrisAmount !== null && (
            <>
              <button type="button" className="btn-outline mt-2 w-full" onClick={payWithQris} disabled={saving}>
                <QrCode className="h-4 w-4" aria-hidden />
                Pay with QRIS · {idr(qrisAmount)}
              </button>
              <p className="mt-1.5 text-center text-[0.8125rem] tabular-nums text-ink-subtle">
                {extra} {ticketsWord(extra)} × {idr(context.ticketPrice ?? 0)}, plus a 1–9 rupiah unique code
              </p>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}
