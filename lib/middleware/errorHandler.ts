// lib/middleware/errorHandler.ts
import type { NextApiResponse } from 'next';

/**
 * Sanitized error response that never exposes internal details to clients
 */
export interface ApiError {
  error: string;
  code: string;
  statusCode?: number;
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

/**
 * Maps error codes to HTTP status codes
 */
const STATUS_CODE_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 502,
};

/**
 * Sanitized error messages safe to send to clients
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Invalid request data',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  INTERNAL_ERROR: 'An unexpected error occurred',
  DATABASE_ERROR: 'Database operation failed',
  EXTERNAL_SERVICE_ERROR: 'External service unavailable',
};

/**
 * Creates a sanitized API error response
 *
 * @param code - Error code from ErrorCodes
 * @param customMessage - Optional custom message (will be sanitized)
 * @returns Sanitized error object
 */
export function createApiError(
  code: keyof typeof ErrorCodes,
  customMessage?: string
): ApiError {
  return {
    error: customMessage || SAFE_ERROR_MESSAGES[code] || 'An error occurred',
    code,
    statusCode: STATUS_CODE_MAP[code] || 500,
  };
}

/**
 * Logs error details server-side and returns sanitized response to client
 *
 * @param error - The original error
 * @param res - Next.js API response object
 * @param context - Context string for logging (e.g., "Creating shift")
 * @returns API response with sanitized error
 */
export function handleApiError(
  error: unknown,
  res: NextApiResponse,
  context?: string
): void {
  // Log the full error server-side (never sent to client)
  console.error(`[API Error]${context ? ` ${context}:` : ''}`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    error,
  });

  // Check if error has a code we recognize
  let errorCode: keyof typeof ErrorCodes = 'INTERNAL_ERROR';
  let statusCode = 500;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // PostgreSQL/Supabase error detection
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      errorCode = 'CONFLICT';
    } else if (
      message.includes('foreign key') ||
      message.includes('not null') ||
      message.includes('check constraint')
    ) {
      errorCode = 'VALIDATION_ERROR';
    } else if (
      message.includes('database') ||
      message.includes('postgres') ||
      message.includes('relation') ||
      message.includes('column')
    ) {
      errorCode = 'DATABASE_ERROR';
    } else if (message.includes('not found') || message.includes('does not exist')) {
      errorCode = 'NOT_FOUND';
    } else if (message.includes('unauthorized') || message.includes('authentication')) {
      errorCode = 'UNAUTHENTICATED';
    } else if (message.includes('forbidden') || message.includes('permission')) {
      errorCode = 'FORBIDDEN';
    }
  }

  statusCode = STATUS_CODE_MAP[errorCode] || 500;

  // Return sanitized error to client
  res.status(statusCode).json({
    error: SAFE_ERROR_MESSAGES[errorCode],
    code: errorCode,
  });
}

/**
 * Validation error helper - throws an error that will be caught by handleApiError
 *
 * @param message - Error message (will be logged but not sent to client)
 */
export function throwValidationError(message: string): never {
  const error = new Error(message);
  error.name = 'ValidationError';
  throw error;
}

/**
 * Not found error helper
 *
 * @param resource - Name of the resource (will be logged but not sent to client)
 */
export function throwNotFoundError(resource: string): never {
  const error = new Error(`${resource} not found`);
  error.name = 'NotFoundError';
  throw error;
}

/**
 * Conflict error helper
 *
 * @param message - Error message (will be logged but not sent to client)
 */
export function throwConflictError(message: string): never {
  const error = new Error(message);
  error.name = 'ConflictError';
  throw error;
}
