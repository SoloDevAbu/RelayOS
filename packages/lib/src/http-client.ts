import { fetch, type RequestInit } from "undici";

export class HttpClientError extends Error {
  public readonly statusCode?: number;
  public readonly responseBody?: string;
  public readonly isTimeout: boolean;
  public readonly latencyMs: number;

  constructor(params: {
    message: string;
    statusCode?: number;
    responseBody?: string;
    isTimeout?: boolean;
    latencyMs: number;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "HttpClientError";
    this.statusCode = params.statusCode;
    this.responseBody = params.responseBody;
    this.isTimeout = params.isTimeout ?? false;
    this.latencyMs = params.latencyMs;
  }
}

export interface HttpResponse {
  statusCode: number;
  responseBody: string;
  latencyMs: number;
}

export const post = async (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs: number = 10_000,
): Promise<HttpResponse> => {
  const start = Date.now();

  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  };

  try {
    const res = await fetch(url, init);
    const latencyMs = Date.now() - start;
    const responseBody = await res.text();

    return { statusCode: res.status, responseBody, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;

    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpClientError({
        message: "Request timed out",
        isTimeout: true,
        latencyMs,
        cause: error,
      });
    }

    throw new HttpClientError({
      message: error instanceof Error ? error.message : "Unknown HTTP client error",
      latencyMs,
      cause: error,
    });
  }
};
