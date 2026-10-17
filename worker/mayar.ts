// Mayar "Pay Me" QRIS through the GraphQL API the Mayar mobile app uses.
// MAYAR_TOKEN is the app's bearer value (the access token is what counts; it
// lasts about a day), so it is a Worker secret that gets rotated by hand.

const ENDPOINT = "https://api.mayar.id/graphql";

export class MayarError extends Error {
  /**
   * expired: the token was refused, rotate MAYAR_TOKEN.
   * refused: Mayar answered with a reason (the message) the desk can show.
   * unavailable: network, timeout, or an unexpected answer.
   */
  readonly kind: "expired" | "refused" | "unavailable";
  constructor(message: string, kind: MayarError["kind"] = "unavailable") {
    super(message);
    this.kind = kind;
  }
}

/** One payme credit from the balance history, as settle_ticket_payment reads it. */
export type PaymeCredit = { id: string; createdAt: number; credit: number; status: string };

async function graphql<T>(token: string, query: string, variables: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "*/*",
        "User-Agent": "MayarMobile-iOS/1.0",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(7000),
    });
  } catch (error) {
    throw new MayarError(`Mayar unreachable: ${error}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new MayarError(`Mayar refused the token: ${await response.text()}`, "expired");
  }
  const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!response.ok || !body?.data) {
    throw new MayarError(`Mayar ${response.status}: ${body?.errors?.map((e) => e.message).join("; ") ?? "no data"}`);
  }
  return body.data;
}

const CREATE_QR = `mutation createQrCodePayme($amount: Int!) {
  createQrCodePayme(amount: $amount) { qrCode errorMessage }
}`;

/** A dynamic QRIS payload for exactly `amount` rupiah. */
export async function createQrCode(token: string, amount: number): Promise<string> {
  const { createQrCodePayme: qr } = await graphql<{ createQrCodePayme: { qrCode: string | null; errorMessage: string | null } | null }>(
    token, CREATE_QR, { amount },
  );
  if (!qr?.qrCode) throw new MayarError(qr?.errorMessage || "Mayar did not create the QR.", qr?.errorMessage ? "refused" : "unavailable");
  return qr.qrCode;
}

const PAYME_CREDITS = `query getAllBalanceHistoryPage($input: BalanceHistoryInput!) {
  getAllBalanceHistoryPage(input: $input) { items { id createdAt credit status } }
}`;

/**
 * The latest payme credits, newest first. 100 rather than 20: the unclaimed
 * list and claims only see credits in this window, and a festival morning
 * passes 20 credits in under an hour.
 */
export async function recentPaymeCredits(token: string): Promise<PaymeCredit[]> {
  const data = await graphql<{ getAllBalanceHistoryPage: { items: Partial<PaymeCredit>[] | null } | null }>(token, PAYME_CREDITS, {
    input: {
      pageSize: 100,
      page: 1,
      sortDirection: "DESC",
      sortField: "createdAt",
      search: {
        balanceHistoryType: [{ operator: "eq", value: "payme" }],
        credit: [{ operator: "gt", value: "0" }],
      },
    },
  });
  // Only well-formed rows reach SQL, which casts these fields.
  return (data.getAllBalanceHistoryPage?.items ?? []).filter(
    (item): item is PaymeCredit =>
      typeof item.id === "string" && Number.isFinite(item.createdAt) && Number.isFinite(item.credit) && typeof item.status === "string",
  ).map(({ id, createdAt, credit, status }) => ({ id, createdAt, credit, status }));
}
