import { CheckCircle2, ChevronDown, Circle, Loader2, RefreshCw, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import type { Polled } from "../hooks/usePolled";
import type { Overview, OverviewEntry, OverviewSession } from "../lib/api";
import { clock, currentSessionNumber, ticketsWord } from "../lib/schedule";

/** Running order grouped by session, then category, as on the event page. */
export default function Participants({ data, focus }: { data: Polled<Overview>; focus: { session: number; nonce: number } | null }) {
  const { value: overview, error, updatedAt, refresh } = data;
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);

  // A session tapped in the navbar: open it and bring it into view.
  useEffect(() => {
    if (!focus) return;
    setClosed((prev) => {
      const next = new Set(prev);
      next.delete(focus.session);
      return next;
    });
    requestAnimationFrame(() => document.getElementById(`session-${focus.session}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focus]);

  const reload = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (!overview) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center text-ink-muted">
        {error ? (
          <>
            <p>{error}</p>
            <button className="btn-outline" onClick={reload} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Try again
            </button>
          </>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-marigold" aria-label="Loading" />
        )}
      </div>
    );
  }

  const current = currentSessionNumber(overview.sessions);

  return (
    <div className="space-y-6">
      <div>
        <span className="type-label inline-flex items-center gap-3 text-ink-accent">
          <span aria-hidden className="h-px w-6 bg-marigold" />
          Running order
        </span>
        <h1 className="mt-3 text-[clamp(1.5rem,1.2rem+1.5vw,2.25rem)]">{overview.event?.title ?? "No running order published"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-ink-muted">
          {overview.event && <span>{overview.event.seatLimit} seats per session · each participant brings 1 guardian</span>}
          <button type="button" className="type-label inline-flex items-center gap-1.5 text-ink-accent hover:text-burgundy" onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refresh"}
          </button>
          {error && <span className="text-status-error-fg">{error}</span>}
        </div>
      </div>

      {overview.sessions.map((session) => (
        <SessionCard
          key={session.number}
          session={session}
          current={session.number === current}
          open={!closed.has(session.number)}
          onToggle={() =>
            setClosed((prev) => {
              const next = new Set(prev);
              if (!next.delete(session.number)) next.add(session.number);
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

function SessionCard({ session, current, open, onToggle }: { session: OverviewSession; current: boolean; open: boolean; onToggle: () => void }) {
  const entries = session.blocks.flatMap((block) => block.entries);
  const performers = entries.reduce((sum, entry) => sum + entry.performers, 0);
  const checkedIn = entries.reduce((sum, entry) => sum + Math.min(entry.checkedIn, entry.performers), 0);
  const panelId = `session-panel-${session.number}`;

  return (
    <section id={`session-${session.number}`} className={`scroll-mt-32 border bg-surface-elevated ${current ? "border-burgundy" : "border-rule-subtle"}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-surface-warm/50"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="whitespace-nowrap font-serif text-[1.375rem] text-ink-primary">Session {session.number}</span>
            {current && <span className="type-label whitespace-nowrap bg-burgundy px-1.5 py-0.5 text-offWhite">Now / next</span>}
          </span>
          <span className="block text-[0.875rem] tabular-nums text-ink-body">
            {clock(session.startsAt)}–{clock(session.endsAt)} · {checkedIn}/{performers} checked in
          </span>
        </span>
        <span className="flex shrink-0 items-start gap-3">
          <span className="text-right">
            <span className={`block text-[1.375rem] font-semibold tabular-nums ${session.ticketsLeft === 0 ? "text-status-error-fg" : "text-ink-primary"}`}>
              {session.ticketsLeft}
            </span>
            <span className="type-label block text-ink-muted">{ticketsWord(session.ticketsLeft)} left</span>
          </span>
          <ChevronDown className={`mt-1.5 h-5 w-5 text-burgundy transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {open && (
        <div id={panelId} className="border-t border-rule-hairline">
          <p className="px-5 py-2 text-[0.8125rem] tabular-nums text-ink-muted">
            {session.participantPax} seats for participants + guardians · {session.ticketsSold} {ticketsWord(session.ticketsSold)} sold
          </p>
          {session.blocks.map((block) => (
            <div key={block.id} className="border-t border-rule-hairline">
              <div className="flex items-baseline justify-between gap-3 bg-surface-warm/60 px-5 py-2.5">
                <span className="font-semibold text-burgundy">{[block.categoryName, block.subCategoryName].filter(Boolean).join(" · ")}</span>
                <span className="shrink-0 text-[0.8125rem] tabular-nums text-ink-muted">
                  {clock(block.startsAt)}–{clock(block.endsAt)} · {block.entries.length}
                </span>
              </div>
              <ol className="px-5">
                {block.entries.map((entry) => (
                  <EntryRow key={entry.order} entry={entry} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: OverviewEntry }) {
  const done = entry.checkedIn >= entry.performers;
  return (
    <li className="flex items-center gap-3 border-b border-rule-hairline/70 py-2.5 last:border-b-0">
      <span className="w-6 shrink-0 font-semibold tabular-nums text-marigold-700">{String(entry.order).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1 text-[0.9375rem] text-ink-primary">{entry.name}</span>
      {entry.tickets > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] tabular-nums text-ink-muted" title={`${entry.tickets} ${ticketsWord(entry.tickets)} bought`}>
          <Ticket className="h-3.5 w-3.5" aria-hidden /> {entry.tickets}
        </span>
      )}
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-status-open-fg" aria-label="Checked in" />
      ) : entry.checkedIn > 0 ? (
        <span className="shrink-0 text-[0.75rem] font-semibold tabular-nums text-status-upcoming-fg" title="Performers checked in">
          {entry.checkedIn}/{entry.performers}
        </span>
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-rule-strong" aria-label="Not checked in" />
      )}
    </li>
  );
}
