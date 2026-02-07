const isDev = import.meta.env.DEV;

const ERROR_BUFFER_SIZE = 50;

interface BufferedError {
  timestamp: string;
  level: "warn" | "error";
  args: unknown[];
}

const errorBuffer: BufferedError[] = [];

function bufferError(level: "warn" | "error", args: unknown[]) {
  errorBuffer.push({
    timestamp: new Date().toISOString(),
    level,
    args,
  });
  if (errorBuffer.length > ERROR_BUFFER_SIZE) {
    errorBuffer.shift();
  }
}

/**
 * Placeholder for future error monitoring integration (Sentry, etc.)
 */
function captureError(_args: unknown[]) {
  // Intentionally a no-op. Wire up to Sentry/LogRocket/etc. here.
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    bufferError("warn", args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    bufferError("error", args);
    captureError(args);
  },
  /** Get recent errors for bug reports or debugging */
  getRecentErrors: (): BufferedError[] => [...errorBuffer],
};
