import { useUser } from "@clerk/clerk-react";

// Must match isStaffRole in worker/index.ts. The Worker is the real gate; this
// only decides what to render and fetch. Role = Clerk publicMetadata.role.
const STAFF_ROLES: Record<string, true> = { admin: true, reg_staff: true };

export function useIsStaff(): boolean {
  const role = useUser().user?.publicMetadata?.role;
  return typeof role === "string" && STAFF_ROLES[role.replace(/^org:/, "")] === true;
}
