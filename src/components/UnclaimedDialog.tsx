import { useAuth } from "@clerk/clerk-react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, claimPayment, NO_CONNECTION, type UnclaimedCredit } from "../lib/api";
import { clock, ticketsWord } from "../lib/schedule";

/**
 * QRIS payments that landed after their QR was cancelled or lapsed, so no desk
 * added the tickets. Each lists the QRs of exactly that amount it could pay
 * (thanks to the unique code, usually one); staff add the tickets to the
 * holder who paid.
 */
export default function UnclaimedDialog({
  credits,
  onClose,
  onClaimed,
}: {
  credits: UnclaimedCredit[];
  onClose: () => void;
  onClaimed: () => void;
}) {
  const { getToken } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const claim = async (creditId: string, paymentId: string) => {
    if (claiming) return;
    setClaiming(paymentId);
    setError(null);
    setDone(null);
    try {
      const token = await getToken().catch(() => {
        throw new ApiError(NO_CONNECTION);
      });
      const claimed = await claimPayment(paymentId, creditId, token);
      setDone(
        `${claimed.holderName ?? "The pass holder"} now holds ${claimed.quantity} ${ticketsWord(claimed.quantity)} for Session ${claimed.sessionNumber}.`,
      );
      onClaimed();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not add the tickets. Try again.");
    } finally {
      setClaiming(null);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && dialogRef.current?.close()}
      className="w-[calc(100%-2rem)] max-w-md border border-rule-hairline border-t-2 border-t-marigold bg-surface-elevated p-0 text-ink-body backdrop:bg-burgundy-700/50"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="type-label text-ink-accent">Unclaimed QRIS</p>
            <h2 className="mt-1 text-[1.375rem]">Paid after the QR closed</h2>
          </div>
          <button type="button" className="-mr-2 -mt-1 p-2 text-ink-muted hover:text-burgundy" onClick={() => dialogRef.current?.close()} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-[0.875rem] text-ink-muted">
          Mayar received these after the desk cancelled the QR or it expired. Add the tickets for the person who paid.
        </p>

        {done && (
          <p className="mt-4 flex items-start gap-2 bg-status-open-bg px-3 py-2 text-[0.875rem] text-status-open-fg">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {done}
          </p>
        )}
        {error && <p className="mt-4 bg-status-error-bg px-3 py-2 text-[0.875rem] text-status-error-fg">{error}</p>}

        {credits.length === 0 ? (
          <p className="mt-6 text-[0.9375rem] text-ink-muted">Nothing unclaimed.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule-hairline border-y border-rule-hairline">
            {credits.map((credit) => (
              <li key={credit.id} className="py-4">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[1.25rem] tabular-nums text-ink-primary">IDR {credit.amount.toLocaleString("en-US")}</span>
                  <span className="text-[0.8125rem] tabular-nums text-ink-muted">paid {clock(credit.paidAt)}</span>
                </p>
                <ul className="mt-2 space-y-2">
                  {credit.payments.map((qr) => (
                    <li key={qr.paymentId} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-[0.875rem]">
                        <span className="block truncate text-ink-primary">{qr.holderName ?? "Pass holder"}</span>
                        <span className="block tabular-nums text-ink-muted">
                          Session {qr.sessionNumber} · QR {clock(qr.createdAt)} · {qr.status}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn-primary shrink-0 px-3"
                        onClick={() => void claim(credit.id, qr.paymentId)}
                        disabled={claiming !== null}
                      >
                        {claiming === qr.paymentId && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Add {qr.quantity} {ticketsWord(qr.quantity)}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
