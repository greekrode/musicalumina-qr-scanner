import { useAuth } from "@clerk/clerk-react";
import { Camera, CheckCircle2, AlertCircle, Flashlight, FlashlightOff, History, Loader2, RotateCcw, Square } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { checkInPass, PASS_PREFIX, type CheckinResult } from "../lib/checkinApi";

type Scan =
  | { id: number; phase: "verifying" }
  | { id: number; phase: "done"; result: CheckinResult }
  | { id: number; phase: "error"; message: string };

type Finished = Exclude<Scan, { phase: "verifying" }>;
type Tone = "ok" | "repeat" | "error";

// qr-scanner reports the same code on every frame; ignore repeats for this long.
const DUPLICATE_WINDOW_MS = 3000;
const HISTORY_LIMIT = 50;

const toneOf = (scan: Scan): Tone | null =>
  scan.phase === "error" ? "error" : scan.phase === "done" ? (scan.result.status === "checked_in" ? "ok" : "repeat") : null;

const TONE_STYLE: Record<Tone, { bar: string; text: string; bg: string; label: string }> = {
  ok: { bar: "bg-status-open-fg", text: "text-status-open-fg", bg: "bg-status-open-bg", label: "Checked in" },
  repeat: { bar: "bg-marigold", text: "text-status-upcoming-fg", bg: "bg-status-upcoming-bg", label: "Already checked in" },
  error: { bar: "bg-status-error-fg", text: "text-status-error-fg", bg: "bg-status-error-bg", label: "Not accepted" },
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function feedback(audio: AudioContext | null, tone: Tone) {
  navigator.vibrate?.(tone === "ok" ? 60 : tone === "repeat" ? [60, 80, 60] : 300);
  if (!audio) return;
  const notes = tone === "ok" ? [880] : tone === "repeat" ? [660, 660] : [220];
  notes.forEach((frequency, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + i * 0.14;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.18, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (tone === "error" ? 0.35 : 0.11));
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

export default function QRScanner() {
  const { getToken, userId } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const recentRef = useRef(new Map<string, number>());
  const sequenceRef = useRef(0);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [current, setCurrent] = useState<Scan | null>(null);
  const [history, setHistory] = useState<Finished[]>([]);

  useEffect(() => {
    const video = videoRef.current!;
    const record = (scan: Finished) => {
      setCurrent((prev) => (prev && prev.id > scan.id ? prev : scan));
      setHistory((prev) => [scan, ...prev.filter((s) => s.id !== scan.id)].slice(0, HISTORY_LIMIT));
      const tone = toneOf(scan);
      if (tone) feedback(audioRef.current, tone);
    };

    const scanner = new QrScanner(
      video,
      async ({ data }) => {
        const text = data.trim();
        const now = Date.now();
        const last = recentRef.current.get(text);
        if (!text || (last && now - last < DUPLICATE_WINDOW_MS)) return;
        recentRef.current.set(text, now);

        const id = ++sequenceRef.current;
        if (!text.startsWith(PASS_PREFIX)) {
          record({ id, phase: "error", message: "This QR code is not a Musica Lumina pass." });
          return;
        }
        setCurrent({ id, phase: "verifying" });
        try {
          const result = await checkInPass(text, await getTokenRef.current());
          record({ id, phase: "done", result });
        } catch (error) {
          // Let staff retry the same pass immediately after a failure.
          recentRef.current.delete(text);
          record({ id, phase: "error", message: error instanceof Error ? error.message : "Check-in failed." });
        }
      },
      { preferredCamera: "environment", maxScansPerSecond: 25, returnDetailedScanResult: true },
    );
    scannerRef.current = scanner;
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, []);

  const start = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    // Audio must be unlocked by a user gesture; this click is it.
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    setStarting(true);
    setCameraError(null);
    try {
      await scanner.start();
      setRunning(true);
      setHasFlash(await scanner.hasFlash());
    } catch {
      setCameraError("Camera unavailable. Allow camera access for this site, then try again.");
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    scannerRef.current?.stop();
    setRunning(false);
    setFlashOn(false);
  };

  const toggleFlash = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    await scanner.toggleFlash();
    setFlashOn(scanner.isFlashOn());
  };

  const tone = current ? toneOf(current) : null;

  return (
    <div className="space-y-6">
      <div>
        <span className="type-label inline-flex items-center gap-3 text-ink-accent">
          <span aria-hidden className="h-px w-6 bg-marigold" />
          Live verification
        </span>
        <h1 className="mt-3 text-[clamp(1.75rem,1.3rem+2vw,2.5rem)]">Scan a participant pass</h1>
      </div>

      <section className="relative mx-auto aspect-square w-full max-w-md overflow-hidden bg-surface-inverse">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

        {/* Viewfinder: thin marigold brackets, tinted by the latest result. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-[14%] transition-colors duration-300 ${
            tone === "ok" ? "text-status-open-fg" : tone === "repeat" ? "text-marigold" : tone === "error" ? "text-[#e07a7a]" : "text-marigold"
          } ${running ? "opacity-100" : "opacity-0"}`}
        >
          {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((corner) => (
            <span key={corner} className={`absolute h-8 w-8 border-current ${corner}`} />
          ))}
        </div>

        {current?.phase === "verifying" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-burgundy-700/80 py-2 text-offWhite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="type-label">Verifying</span>
          </div>
        )}

        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <Camera className="h-8 w-8 text-marigold" aria-hidden />
            <p className="max-w-xs text-[0.9375rem] text-offWhite/80">
              {cameraError ?? "Hold the pass inside the frame. Each scan checks in instantly."}
            </p>
            <button className="btn-primary min-w-[12rem]" onClick={start} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
              {cameraError ? "Try again" : "Start scanning"}
            </button>
          </div>
        )}
      </section>

      {running && (
        <div className="mx-auto flex max-w-md gap-3">
          <button className="btn-outline flex-1" onClick={stop}>
            <Square className="h-4 w-4" aria-hidden /> Stop camera
          </button>
          {hasFlash && (
            <button className="btn-outline px-4" onClick={toggleFlash} aria-pressed={flashOn} aria-label={flashOn ? "Turn torch off" : "Turn torch on"}>
              {flashOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}

      <div aria-live="polite" className="mx-auto max-w-md">
        {current && current.phase !== "verifying" && <ResultCard scan={current} userId={userId} />}
      </div>

      {history.length > 0 && (
        <details className="mx-auto max-w-md border-t border-rule-hairline pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="type-label inline-flex items-center gap-2 text-ink-muted">
              <History className="h-3.5 w-3.5" aria-hidden /> Recent scans ({history.length})
            </span>
            <button
              className="type-label text-ink-accent hover:text-burgundy"
              onClick={(e) => {
                e.preventDefault();
                setHistory([]);
                recentRef.current.clear();
              }}
            >
              <RotateCcw className="mr-1 inline h-3 w-3" aria-hidden /> Clear
            </button>
          </summary>
          <ul className="mt-3 divide-y divide-rule-hairline">
            {history.map((scan) => {
              const t = toneOf(scan);
              if (!t) return null;
              return (
                <li key={scan.id} className="flex items-center gap-3 py-3">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE_STYLE[t].bar}`} />
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink-primary">
                    {scan.phase === "done" ? scan.result.registration.name ?? "Unnamed" : scan.message}
                  </span>
                  <span className={`type-label shrink-0 ${TONE_STYLE[t].text}`}>{TONE_STYLE[t].label}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function ResultCard({ scan, userId }: { scan: Finished; userId: string | null | undefined }) {
  const tone = toneOf(scan)!;
  const style = TONE_STYLE[tone];

  if (scan.phase === "error") {
    return (
      <article className="border border-rule-hairline bg-surface-elevated">
        <div className={`h-1 ${style.bar}`} />
        <div className="flex gap-4 p-6">
          <AlertCircle className={`mt-0.5 h-6 w-6 shrink-0 ${style.text}`} aria-hidden />
          <div>
            <p className={`type-label ${style.text}`}>{style.label}</p>
            <p className="mt-2 text-[0.9375rem] text-ink-body">{scan.message}</p>
          </div>
        </div>
      </article>
    );
  }

  const { result } = scan;
  const reg = result.registration;
  const details = [
    ["Category", reg.categoryName],
    ["Sub-category", reg.subCategoryName],
    ["Piece", reg.songTitle],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <article className="border border-rule-hairline bg-surface-elevated">
      <div className={`h-1 ${style.bar}`} />
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={`type-label inline-flex items-center gap-2 whitespace-nowrap ${style.text}`}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {style.label}
          </span>
          <span className="type-label whitespace-nowrap text-ink-subtle">
            {result.status === "already_checked_in" && "First in "}
            {timeOf(result.checkedInAt)}
            {result.status === "already_checked_in" && result.checkedInBy === userId && " · by you"}
          </span>
        </div>
        <h2 className="mt-4 text-[clamp(1.5rem,1.2rem+1.5vw,2rem)]">{reg.name ?? "Unnamed registration"}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {result.kind === "teacher" && <span className={`type-label px-2 py-1 ${style.bg} text-burgundy`}>Teacher</span>}
          {reg.registrationStatus !== "verified" && (
            <span className="type-label bg-status-upcoming-bg px-2 py-1 text-status-upcoming-fg">Payment {reg.registrationStatus}</span>
          )}
        </div>
        {details.length > 0 && (
          <dl className="mt-5 divide-y divide-rule-hairline border-t border-rule-hairline">
            {details.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3">
                <dt className="type-label pt-1 text-ink-muted">{label}</dt>
                <dd className="text-right text-[0.9375rem] text-ink-primary">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
