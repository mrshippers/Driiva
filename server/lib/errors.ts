/**
 * Safe error response helper.
 * Logs the full error server-side but returns only a generic message to the client.
 * In development mode, includes the error message for debugging.
 */
import type { Response } from "express";

const isDevelopment = process.env.NODE_ENV === "development";

export function safeErrorResponse(
  res: Response,
  statusCode: number,
  publicMessage: string,
  error: unknown
): void {
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  console.error(`[API Error] ${publicMessage}:`, errorMessage);

  res.status(statusCode).json({
    message: isDevelopment ? `${publicMessage}: ${errorMessage}` : publicMessage,
  });
}
