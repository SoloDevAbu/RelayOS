export type PlanningErrorCode =
  | "MODEL_NO_TOOL_CALL"
  | "MODEL_CONTENT_FILTERED"
  | "MODEL_TRUNCATED"
  | "LLM_CALL_FAILED";

/**
 * Thrown for any failure in the plan() pipeline that the caller
 * (route handler) needs to distinguish and map to an HTTP status,
 * instead of letting raw SDK errors or ambiguous fallbacks leak out.
 */
export class PlanningError extends Error {
  readonly code: PlanningErrorCode;
  readonly finishReason?: string;
  readonly rawText?: string;

  constructor(
    code: PlanningErrorCode,
    message: string,
    opts?: { finishReason?: string; rawText?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "PlanningError";
    this.code = code;
    this.finishReason = opts?.finishReason;
    this.rawText = opts?.rawText;
    if (opts?.cause) this.cause = opts.cause;
  }
}
