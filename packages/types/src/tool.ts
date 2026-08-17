export type ToolInvocationType = "LOCAL" | "WEBHOOK";

export type ToolAuthType = "NONE" | "BEARER" | "API_KEY_HEADER" | "BASIC";

export type ToolExecutionResult =
  | { success: true; output: unknown; durationMs: number; statusCode?: number }
  | {
      success: false;
      error: string;
      retryable: boolean;
      durationMs: number;
      statusCode?: number;
    };
