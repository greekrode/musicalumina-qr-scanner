export const PASS_PREFIX = "ML1:";

export type CheckinResult = {
  status: "checked_in" | "already_checked_in";
  kind: "participant" | "teacher";
  checkedInAt: string;
  checkedInBy: string;
  registration: {
    id: string;
    name: string | null;
    songTitle: string | null;
    categoryName: string | null;
    subCategoryName: string | null;
    registrationStatus: string;
  };
};

export async function checkInPass(pass: string, sessionToken: string | null): Promise<CheckinResult> {
  if (!sessionToken) throw new Error("Your session expired. Sign in again.");
  const response = await fetch("/api/checkin", {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pass }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Check-in failed. Try again.");
  return body as CheckinResult;
}
