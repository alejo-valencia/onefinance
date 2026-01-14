/**
 * Shared utility functions
 */

import { https } from "firebase-functions";
import * as admin from "firebase-admin";

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
 * Validates Firebase ID token from Authorization header
 * Also checks if the user's email matches the authorized email
 * Returns true if valid, sends error response and returns false if invalid
 */
export async function validateAuth(
  req: https.Request,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const authorizedEmail = process.env.AUTHORIZED_EMAIL;

  if (!authorizedEmail) {
    console.error("❌ AUTHORIZED_EMAIL environment variable not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return false;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error(
      "❌ Unauthorized request - missing or invalid Authorization header"
    );
    res
      .status(401)
      .json({ error: "Unauthorized - Missing authorization token" });
    return false;
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      console.error("❌ No email in token");
      res.status(401).json({ error: "Unauthorized - No email in token" });
      return false;
    }

    // Check if email matches authorized email
    if (userEmail !== authorizedEmail) {
      console.error(`❌ Unauthorized email: ${userEmail}`);
      res.status(403).json({ error: "Forbidden - Email not authorized" });
      return false;
    }

    console.log(`✅ Authenticated user: ${userEmail}`);
    return true;
  } catch (error) {
    console.error("❌ Token verification failed:", error);
    res.status(401).json({ error: "Unauthorized - Invalid token" });
    return false;
  }
}

/**
 * Sync version of validateAuth for backward compatibility
 * Note: This is deprecated, use the async version
 * @deprecated Use async validateAuth instead
 */
export function validateAuthSync(
  req: https.Request,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): boolean {
  console.warn("⚠️ validateAuthSync is deprecated, use async validateAuth");
  // Return false to force migration to async version
  res.status(500).json({ error: "Server requires update to async auth" });
  return false;
}
