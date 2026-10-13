import { AlertCircle, Loader2, RefreshCw, ScanLine, Ticket, Users } from "lucide-react";
import type { EventOverview } from "../hooks/useEventOverview";
import { currentSessionNumber } from "../lib/schedule";

export type DeskTab = "scan" | "participants";

const TABS: { id: DeskTab; label: string; short: string; Icon: typeof ScanLine }[] = [
  { id: "scan", label: "Scan", short: "Scan", Icon: ScanLine },
  { id: "participants", label: "Participants", short: "List", Icon: Users },
];

export function DeskTabs({ tab, onChange }: { tab: DeskTab; onChange: (tab: DeskTab) => void }) {
  return (
    <nav aria-label="Desk" className="flex shrink-0 rounded-sm border border-rule-subtle p-0.5">
      {TABS.map(({ id, label, short, Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={tab === id ? "page" : undefined}
          onClick={() => onChange(id)}
          className={`type-label inline-flex h-9 items-center gap-1.5 rounded-[1px] px-2.5 transition-colors duration-200 sm:px-3 ${
            tab === id ? "bg-burgundy text-offWhite" : "text-ink-muted hover:text-burgundy"
          }`}
        >
          <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Navbar row: audience tickets still on sale per session. Tap a session to see who plays. */
export function TicketsStrip({ data, onSelectSession }: { data: EventOverview; onSelectSession: (session: number) => void }) {
  const { overview, error, refresh } = data;
  if (overview && !overview.event) return null; // no festival running order published

  const sessions = overview?.sessions ?? [];
  const current = currentSessionNumber(sessions);

  return (
    <div className="border-t border-rule-hairline">
      <div className="no-scrollbar mx-auto flex h-11 max-w-3xl items-center gap-2 overflow-x-auto px-4">
        <span className="type-label inline-flex shrink-0 items-center gap-1.5 pr-1 text-ink-muted">
          <Ticket className="h-3.5 w-3.5" aria-hidden /> Tickets left
        </span>
        {!overview && !error && <Loader2 className="h-4 w-4 animate-spin text-marigold" aria-label="Loading" />}
        {sessions.map((session) => {
          const tone =
            session.number === current
              ? "border-burgundy bg-burgundy text-offWhite"
              : session.ticketsLeft === 0
                ? "border-status-error-fg/30 text-status-error-fg"
                : session.ticketsLeft <= 10
                  ? "border-marigold/50 text-status-upcoming-fg"
                  : "border-rule-subtle text-ink-primary";
          return (
            <button
              key={session.number}
              type="button"
              onClick={() => onSelectSession(session.number)}
              title={`Session ${session.number}: ${session.ticketsLeft} tickets left`}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-[0.8125rem] tabular-nums transition-colors duration-200 ${tone}`}
            >
              <span className="opacity-70">S{session.number}</span>
              <span className="font-semibold">{session.ticketsLeft === 0 ? "Full" : session.ticketsLeft}</span>
            </button>
          );
        })}
        {error && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="type-label inline-flex shrink-0 items-center gap-1.5 text-status-error-fg"
            title={error}
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            {overview ? "Not updated" : "Unavailable"}
            <RefreshCw className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
