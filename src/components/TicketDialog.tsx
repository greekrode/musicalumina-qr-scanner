import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Banknote, Camera, CheckCircle2, Landmark, Loader2, Minus, Plus, QrCode, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  checkQrisPayment,
  NO_CONNECTION,
  payManually,
  saveTickets,
  startQrisPayment,
  type Buyer,
  type PassContext,
  type QrisPayment,
  type SavedTickets,
} from "../lib/api";
import { transferPhoto } from "../lib/photo";
import { clock, currentSessionNumber, ticketsWord } from "../lib/schedule";
import QrisCode from "./QrisCode";

const idr = (amount: number) => `IDR ${amount.toLocaleString("en-US")}`;

type Method = "qris" | "cash" | "transfer";
const METHODS: { id: Method; label: string; Icon: typeof QrCode }[] = [
  { id: "qris", label: "QRIS", Icon: QrCode },
  { id: "cash", label: "Cash", Icon: Banknote },
  { id: "transfer", label: "Bank transfer", Icon: Landmark },
];
const PAID_LABEL: Record<Method, string> = { qris: "Payment received", cash: "Cash received", transfer: "Transfer recorded" };

/**
 * Buy or edit the audience tickets a scanned pass holds for one session, or
 * sell tickets to a walk-in without a pass (a fresh purchase every time).
 * The count can never exceed what is free plus what the holder already has;
 * the server enforces the same limit for concurrent desks.
 *
 * Buying more tickets (with a ticket price set) goes on to the price and the
 * payment method: QRIS shows a Mayar QR and checks every second until the
 * payment lands; cash is recorded as is; a bank transfer needs a photo of it.
 * Lowering or removing tickets saves directly.
 */
export default function TicketDialog({
  buyer,
  holderName,
  context,
  onClose,
  onSaved,
}: {
  buyer: Buyer;
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
  // Second step: the price and how it is paid.
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<Method>("qris");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  // QRIS: the QR on screen.
  const [payment, setPayment] = useState<QrisPayment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paid, setPaid] = useState<(SavedTickets & { amount: number; added: number; method: Method }) | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const waiting = payment !== null && paid === null;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // The preview URL lives as long as its photo.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

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
          setPaid({ ...result, added: payment.quantity, method: "qris" });
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
  // More tickets with a price set are paid for; anything else saves directly.
  const price = context.ticketPrice;
  const buying = extra > 0 && price !== null && price > 0;
  const total = buying ? price * extra : 0;

  const set = (next: number) => {
    setError(null);
    setValue(String(Math.min(Math.max(next, 0), max)));
  };

  const pickSession = (next: number) => {
    setSessionNumber(next);
    setError(null);
    setValue(startValue(next));
  };

  /** A refused purchase says how many this holder may have; clamp to it and go back to the count. */
  const showRefusal = (failure: unknown, fallback: string) => {
    if (failure instanceof ApiError && failure.available !== undefined && sessionNumber !== null) {
      const available = failure.available;
      setFree((prev) => ({ ...prev, [sessionNumber]: Math.max(0, available - current) }));
      setValue(String(Math.min(quantity, available)));
      setPaying(false);
    }
    setError(failure instanceof Error ? failure.message : fallback);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving || sessionNumber === null) return;
    setError(null);
    if (buying || !("pass" in buyer)) {
      setPaying(true);
      return;
    }
    setSaving(true);
    try {
      onSaved(await saveTickets(buyer.pass, sessionNumber, quantity, await token()));
      onClose();
    } catch (failure) {
      showRefusal(failure, "Could not save the tickets. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pay = async () => {
    if (!buying || saving || (method === "transfer" && !photo)) return;
    setSaving(true);
    setError(null);
    try {
      if (method === "qris") {
        const started = await startQrisPayment(buyer, sessionNumber, extra, await token());
        setNow(Date.now());
        setPayment(started);
      } else {
        const result = await payManually(buyer, sessionNumber, extra, method, method === "transfer" ? photo?.blob ?? null : null, await token());
        onSaved(result);
        setPaid({ ...result, added: extra, method });
      }
    } catch (failure) {
      showRefusal(failure, "Could not record the payment. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const blob = await transferPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not read the photo. Take it again.");
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
        setPaid({ ...result, added: payment.quantity, method: "qris" });
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
  const errorBox = error && <p className="mt-4 bg-status-error-bg px-3 py-2 text-[0.875rem] text-status-error-fg">{error}</p>;
  const header = (label: string, closable: boolean) => (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="type-label text-ink-accent">{label}</p>
        <h2 className="mt-1 truncate text-[1.375rem]">{holderName}</h2>
      </div>
      {closable && (
        <button type="button" className="-mr-2 -mt-1 p-2 text-ink-muted hover:text-burgundy" onClick={() => dialogRef.current?.close()} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );

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
          <p className="type-label mt-3 text-status-open-fg">{PAID_LABEL[paid.method]}</p>
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
          {header("Pay with QRIS", false)}
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
          {errorBox}
          <button type="button" className="btn-outline mt-6 w-full" onClick={cancelPayment} disabled={cancelling}>
            {cancelling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Cancel payment
          </button>
        </div>
      ) : paying && buying ? (
        <div className="p-6">
          {header("Payment", true)}
          <div className="mt-5 border-y border-rule-hairline py-4 text-center">
            <p className="font-serif text-[2rem] tabular-nums leading-tight text-ink-primary">{idr(total)}</p>
            <p className="mt-1 text-[0.875rem] tabular-nums text-ink-muted">
              {extra} {ticketsWord(extra)} × {idr(price ?? 0)}
              {session && ` · Session ${session.number}`}
            </p>
          </div>

          <p className="type-label mt-5 text-ink-muted">Paid by</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {METHODS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={method === id}
                onClick={() => {
                  setMethod(id);
                  setError(null);
                }}
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-sm border text-[0.8125rem] transition-colors duration-200 ${
                  method === id ? "border-burgundy bg-burgundy text-offWhite" : "border-rule-subtle text-ink-primary hover:border-burgundy"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {method === "qris" && (
            <p className="mt-3 text-[0.8125rem] text-ink-subtle">The QR adds a 1–9 rupiah unique code so the payment can be matched.</p>
          )}
          {method === "cash" && <p className="mt-3 text-[0.8125rem] text-ink-subtle">Collect {idr(total)} in cash, then confirm.</p>}
          {method === "transfer" && (
            <div className="mt-3">
              {photo && <img src={photo.url} alt="Bank transfer" className="mb-2 max-h-48 w-full border border-rule-hairline object-contain" />}
              <label className="btn-outline w-full cursor-pointer">
                <Camera className="h-4 w-4" aria-hidden />
                {photo ? "Retake photo" : "Take photo of the transfer"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    void takePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          )}

          {errorBox}

          <button type="button" className="btn-primary mt-6 w-full" onClick={() => void pay()} disabled={saving || (method === "transfer" && !photo)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {method === "qris" ? "Show QRIS" : method === "cash" ? `Cash received · ${idr(total)}` : `Confirm transfer · ${idr(total)}`}
          </button>
          <button
            type="button"
            className="type-label mx-auto mt-3 flex items-center gap-1.5 text-ink-muted hover:text-burgundy"
            onClick={() => {
              setPaying(false);
              setError(null);
            }}
            disabled={saving}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Change tickets
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="p-6">
          {header(current > 0 ? "Edit tickets" : "Buy ticket", true)}

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

          {errorBox}

          <button type="submit" className="btn-primary mt-6 w-full" disabled={!valid || saving || quantity === current}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {extra > 0
              ? `Buy ${extra} ${current > 0 ? "more " : ""}${ticketsWord(extra)}`
              : quantity === 0 && current > 0
                ? "Remove tickets"
                : current > 0
                  ? "Save"
                  : `Buy ${ticketsWord(0)}`}
          </button>
        </form>
      )}
    </dialog>
  );
}
