export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookUrl = process.env.AIRTABLE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[airtable-webhook] AIRTABLE_WEBHOOK_URL not configured");
    return new Response(
      JSON.stringify({ error: "AIRTABLE_WEBHOOK_URL not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.text();
    console.log("[airtable-webhook] forwarding:", body);

    const airtableRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const responseText = await airtableRes.text();
    console.log(
      "[airtable-webhook] airtable responded:",
      airtableRes.status,
      responseText
    );

    return new Response(responseText, {
      status: airtableRes.status,
      headers: {
        "Content-Type":
          airtableRes.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[airtable-webhook] error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
