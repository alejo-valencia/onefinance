import { https } from "firebase-functions";
import * as admin from "firebase-admin";

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("requires an index")) {
      return `Firestore index required: ${error.message}`;
    }
    return error.message;
  }
  return "Unknown error";
}

export function isFirestoreIndexError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("requires an index");
}

export function requireEnvVars(vars: string[]): void {
  const missing = vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

export async function validateAuth(
  req: https.Request,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const authorizedEmail = process.env.AUTHORIZED_EMAIL;

  if (!authorizedEmail) {
    res.status(500).json({
      success: false,
      error: "Server configuration error",
      message: "AUTHORIZED_EMAIL environment variable is not configured",
    });
    return false;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
      message:
        "Missing or invalid Authorization header. Expected format: Bearer <token>",
    });
    return false;
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      res.status(401).json({
        success: false,
        error: "Invalid token",
        message: "The provided token does not contain an email address",
      });
      return false;
    }

    if (userEmail !== authorizedEmail) {
      res.status(403).json({
        success: false,
        error: "Access denied",
        message: `The email ${userEmail} is not authorized to access this resource`,
      });
      return false;
    }

    return true;
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Token verification failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify the provided token",
    });
    return false;
  }
}
