export interface WebhookRequest {
  url: string;
  httpMethod: string;
  timeoutMs: number;
  authType: "NONE" | "BEARER" | "API_KEY_HEADER" | "BASIC";
  authHeaderName?: string | null;
  credential?: string;
  idempotencyKey: string;
  body: unknown;
}

export interface WebhookResponse {
  statusCode: number;
  body: string;
  durationMs: number;
}

export class WebhookTimeoutError extends Error {
  constructor(public readonly durationMs: number) {
    super("Webhook call aborted: timeout exceeded");
    this.name = "WebhookTimeoutError";
  }
}

export class WebhookNetworkError extends Error {
  constructor(
    message: string,
    public readonly durationMs: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "WebhookNetworkError";
  }
}

function buildAuthHeaders(
  authType: WebhookRequest["authType"],
  authHeaderName: string | null | undefined,
  credential: string | undefined,
): Record<string, string> {
  if (!credential || authType === "NONE") return {};

  switch (authType) {
    case "BEARER":
      return { Authorization: `Bearer ${credential}` };
    case "API_KEY_HEADER":
      return { [authHeaderName ?? "X-Api-Key"]: credential };
    case "BASIC": {
      const encoded = Buffer.from(credential).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
  }
}

/**
 * Sends the outbound HTTP request to a WEBHOOK tool's endpoint.
 *
 * Idempotency-Key convention: `{executionId}:{stepId}:{attempt}`
 * The user's server can key off this header to deduplicate retried requests.
 */
export async function callWebhook(
  req: WebhookRequest,
): Promise<WebhookResponse> {
  const authHeaders = buildAuthHeaders(
    req.authType,
    req.authHeaderName,
    req.credential,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(req.url, {
      method: req.httpMethod,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": req.idempotencyKey,
        ...authHeaders,
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    const durationMs = Date.now() - start;
    const body = await response.text();
    return { statusCode: response.status, body, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (
      error instanceof DOMException && error.name === "AbortError"
    ) {
      throw new WebhookTimeoutError(durationMs);
    }
    throw new WebhookNetworkError(
      error instanceof Error ? error.message : "Unknown network error",
      durationMs,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}
