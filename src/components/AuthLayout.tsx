import { SignInButton, UserButton, useAuth, useUser } from "@clerk/clerk-react";
import { Loader2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

// Must match isStaffRole in worker/index.ts. The Worker is the real gate; this
// only decides what to render. Role = Clerk publicMetadata.role.
const STAFF_ROLES = new Set(["admin", "reg_staff"]);
const isStaffRole = (role: unknown) => typeof role === "string" && STAFF_ROLES.has(role.replace(/^org:/, ""));

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="type-label inline-flex items-center gap-3 text-ink-accent">
      <span aria-hidden className="h-px w-6 bg-marigold" />
      {children}
    </span>
  );
}

function StateCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md border border-rule-hairline border-t-2 border-t-marigold bg-surface-elevated p-8 text-center sm:p-10">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 text-[1.75rem]">{title}</h1>
        <div className="mt-3 text-[0.9375rem] text-ink-muted">{children}</div>
      </div>
    </main>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const isStaff = isStaffRole(user?.publicMetadata?.role);
  const resolving = !isLoaded || (isSignedIn && !user);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-canvas">
      <header className="sticky top-0 z-20 border-b border-rule-hairline bg-surface-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Musica Lumina" className="h-6 w-auto" />
            <span aria-hidden className="h-5 w-px bg-rule-subtle" />
            <span className="type-label text-ink-muted">Check-in desk</span>
          </div>
          {isSignedIn && <UserButton />}
        </div>
      </header>

      {resolving ? (
        <StateCard eyebrow="Staff access" title="Opening the desk…">
          <Loader2 className="mx-auto mt-2 h-5 w-5 animate-spin text-marigold" aria-label="Loading" />
        </StateCard>
      ) : !isSignedIn ? (
        <StateCard eyebrow="Staff access" title="Welcome back.">
          <p>Sign in with your Musica Lumina staff account to start checking in participants.</p>
          <SignInButton mode="modal">
            <button className="btn-primary mt-8 w-full">Sign in</button>
          </SignInButton>
        </StateCard>
      ) : !isStaff ? (
        <StateCard eyebrow="Access denied" title="Not authorised.">
          <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-status-error-fg" aria-hidden />
          <p>This account has no check-in role (reg_staff). Ask an admin to grant you access.</p>
          <button className="btn-outline mt-8 w-full" onClick={() => signOut()}>
            Sign out
          </button>
        </StateCard>
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:pt-10">{children}</main>
      )}
    </div>
  );
}
