/**
 * Structured API error handling
 *
 * Parses all three backend error formats into a unified ApiError type
 * that the frontend can use for differentiated UX and retry logic.
 *
 * Backend formats:
 *   1. AppError:   { error: string, code: string, details?: object }
 *   2. HTTPException: { detail: string }
 *   3. Pydantic 422: { detail: [{ loc: [...], msg: string, type: string }] }
 */

/** Machine-readable error codes matching the backend contract */
export type ApiErrorCode =
  // Backend codes
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "GENERATION_FAILED"
  | "NO_CONTENT_GENERATED"
  | "UPSTREAM_API_ERROR"
  | "REQUEST_TIMEOUT"
  | "NOT_FOUND"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_TOKEN"
  | "ACCESS_DENIED"
  | "VALIDATION_ERROR"
  // Client-side codes
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

/** Structured error with everything the frontend needs to handle it */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  status: number;
  requestId?: string;
  details?: unknown;
  retryable: boolean;
  raw?: unknown;
}

const RETRYABLE_CODES = new Set<ApiErrorCode>([
  "RATE_LIMITED",
  "UPSTREAM_API_ERROR",
  "GENERATION_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

const USER_MESSAGES: Record<ApiErrorCode, string> = {
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  QUOTA_EXHAUSTED: "Daily quota reached. Please try again tomorrow.",
  GENERATION_FAILED: "Generation failed. You can try again.",
  NO_CONTENT_GENERATED:
    "No content was generated. Try adjusting your prompt.",
  UPSTREAM_API_ERROR:
    "An external service is having trouble. Try again shortly.",
  REQUEST_TIMEOUT:
    "The request took too long. Try a simpler prompt or smaller file.",
  NOT_FOUND: "The requested resource was not found.",
  AUTHENTICATION_REQUIRED: "Please sign in to continue.",
  INVALID_TOKEN: "Your session has expired. Please sign in again.",
  ACCESS_DENIED: "You do not have permission to perform this action.",
  VALIDATION_ERROR: "Please check your input and try again.",
  NETWORK_ERROR:
    "Unable to connect. Please check your internet connection.",
  TIMEOUT: "The request timed out. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** Map HTTP status to an error code when the backend doesn't provide one */
function statusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "VALIDATION_ERROR";
    case 401:
      return "AUTHENTICATION_REQUIRED";
    case 403:
      return "ACCESS_DENIED";
    case 404:
      return "NOT_FOUND";
    case 413:
      return "VALIDATION_ERROR";
    case 429:
      return "RATE_LIMITED";
    case 502:
      return "UPSTREAM_API_ERROR";
    case 503:
      return "UPSTREAM_API_ERROR";
    case 504:
      return "REQUEST_TIMEOUT";
    default:
      return status >= 500 ? "GENERATION_FAILED" : "UNKNOWN";
  }
}

/**
 * Parse a non-ok Response into a structured ApiError.
 * Handles all three backend error formats.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  let code: ApiErrorCode | undefined;
  let message: string | undefined;
  let details: unknown;

  try {
    const body = await response.json();

    if (body.code && typeof body.code === "string") {
      // Format 1: AppError — { error, code, details }
      code = body.code as ApiErrorCode;
      message = body.error || body.message;
      details = body.details;
    } else if (Array.isArray(body.detail)) {
      // Format 3: Pydantic 422 — { detail: [{ loc, msg, type }] }
      code = "VALIDATION_ERROR";
      const fields = body.detail
        .map((d: { loc?: string[]; msg?: string }) => {
          const field = d.loc?.slice(1).join(".") || "unknown";
          return `${field}: ${d.msg}`;
        })
        .join("; ");
      message = `Validation error: ${fields}`;
      details = body.detail;
    } else if (body.detail) {
      // Format 2: HTTPException — { detail: string }
      message = body.detail;
    } else if (body.error) {
      message = body.error;
    } else if (body.message) {
      message = body.message;
    }
  } catch {
    // Body wasn't JSON — use status text
  }

  if (!code) {
    code = statusToCode(response.status);
  }

  return {
    code,
    message: message || USER_MESSAGES[code] || USER_MESSAGES.UNKNOWN,
    status: response.status,
    requestId,
    details,
    retryable: RETRYABLE_CODES.has(code),
  };
}

/**
 * Parse a network-level error (fetch threw, not a Response).
 * Handles TypeError "Failed to fetch", AbortError (timeout), etc.
 */
export function parseNetworkError(error: unknown): ApiError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "TIMEOUT",
      message: USER_MESSAGES.TIMEOUT,
      status: 0,
      retryable: true,
      raw: error,
    };
  }

  if (error instanceof TypeError) {
    return {
      code: "NETWORK_ERROR",
      message: USER_MESSAGES.NETWORK_ERROR,
      status: 0,
      retryable: true,
      raw: error,
    };
  }

  return {
    code: "UNKNOWN",
    message:
      error instanceof Error ? error.message : USER_MESSAGES.UNKNOWN,
    status: 0,
    retryable: false,
    raw: error,
  };
}

/** Type guard for ApiError */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "retryable" in error &&
    "status" in error
  );
}

/** Get user-friendly message for an error code */
export function getUserMessage(code: ApiErrorCode): string {
  return USER_MESSAGES[code] || USER_MESSAGES.UNKNOWN;
}
