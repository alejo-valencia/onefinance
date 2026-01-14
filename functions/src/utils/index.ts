/**
 * Shared utility functions
 */

import { https } from "firebase-functions";

/**
 * Helper to extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Ensures required environment variables are set
 */
export function requireEnvVars(vars: string[]): void {
  const missing = vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const errorMsg = `❌ Missing required environment variables: ${missing.join(
      ", "
    )}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Validates the API token from query parameter
 * Returns true if valid, sends 401 response and returns false if invalid
 */
export function validateAuth(
  req: https.Request,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): boolean {
  const token = req.query.token;
  const expectedToken = process.env.API_TOKEN;

  if (!expectedToken) {
    console.error("❌ API_TOKEN environment variable not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return false;
  }

  if (typeof token !== "string" || token !== expectedToken) {
    console.error("❌ Unauthorized request - invalid or missing token");
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}
