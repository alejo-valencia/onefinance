/**
 * Gmail service - handles OAuth and Gmail API interactions
 */

import { google, gmail_v1, Auth } from "googleapis";
import { OAUTH_CONFIG } from "../config/constants";
import {
  EmailHeaders,
  GmailClientResult,
  GmailConfig,
  GmailMessagePart,
  GmailTokens,
} from "../types";
import { getGmailConfigRef } from "./email";
import { requireEnvVars } from "../utils";

/**
 * Buffer time before token expiration to trigger refresh (5 minutes)
 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const oauth2Client = new google.auth.OAuth2(
  OAUTH_CONFIG.clientId,
  OAUTH_CONFIG.clientSecret,
  OAUTH_CONFIG.redirectUri
);

function ensureGmailOAuthEnv(): void {
  requireEnvVars([
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REDIRECT_URI",
  ]);
}

// Handle token refresh once at module level to avoid memory leaks
oauth2Client.on(
  "tokens",
  async (newTokens: Auth.Credentials): Promise<void> => {
    try {
      console.log("🔄 Token refresh detected...");
      const doc = await getGmailConfigRef().get();
      if (doc.exists) {
        const data = doc.data() as GmailConfig | undefined;
        const currentTokens = data?.tokens ?? {};
        const updatedTokens = { ...currentTokens, ...newTokens };
        await getGmailConfigRef().update({ tokens: updatedTokens });
        console.log("✅ Tokens refreshed and saved successfully");
      }
    } catch (error) {
      console.error("❌ Error saving refreshed tokens:", error);
    }
  }
);

/**
 * Check if the access token is expired or about to expire
 */
function isTokenExpiredOrExpiring(tokens: GmailTokens): boolean {
  if (!tokens.expiry_date) {
    // No expiry date means we should try to refresh
    return true;
  }

  const now = Date.now();
  const expiresAt = tokens.expiry_date;

  // Check if token is expired or will expire within the buffer time
  return now >= expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Proactively refresh the access token if needed
 */
async function ensureValidToken(tokens: GmailTokens): Promise<void> {
  if (!isTokenExpiredOrExpiring(tokens)) {
    console.log("✅ Access token is still valid");
    return;
  }

  if (!tokens.refresh_token) {
    console.error("❌ No refresh token available - user must re-authorize");
    throw new Error("No refresh token available. Please re-authorize the app.");
  }

  console.log("⏰ Access token expired or expiring soon, refreshing...");

  // Set credentials with the refresh token to trigger refresh
  oauth2Client.setCredentials(tokens);

  // Force a token refresh by calling getAccessToken
  const { token } = await oauth2Client.getAccessToken();

  if (!token) {
    throw new Error("Failed to refresh access token");
  }

  console.log("✅ Access token refreshed successfully");
}

/**
 * Get authenticated Gmail client
 * Proactively refreshes token if it's expired or about to expire
 */
export async function getGmailClient(): Promise<GmailClientResult> {
  ensureGmailOAuthEnv();
  console.log("🔐 Getting Gmail client...");
  const doc = await getGmailConfigRef().get();

  if (!doc.exists) {
    console.error("❌ Gmail config not found in Firestore");
    throw new Error("Gmail config not found. Please authorize first.");
  }

  const data = doc.data() as GmailConfig | undefined;
  if (!data?.tokens) {
    console.error("❌ Gmail tokens not found in config");
    throw new Error("Gmail tokens not found. Please authorize first.");
  }

  // Proactively refresh token if needed before making API calls
  await ensureValidToken(data.tokens);

  oauth2Client.setCredentials(data.tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  console.log("✅ Gmail client ready");

  return { gmail, lastHistoryId: data.lastHistoryId };
}

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(): string {
  ensureGmailOAuthEnv();
  console.log("🔗 Generating OAuth URL...");
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string): Promise<GmailTokens> {
  ensureGmailOAuthEnv();
  console.log("🔑 Exchanging auth code for tokens...");
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  console.log("✅ Tokens obtained successfully");
  return tokens as GmailTokens;
}

/**
 * Extract email headers from Gmail message
 */
export function extractEmailHeaders(
  message: gmail_v1.Schema$Message
): EmailHeaders {
  const headers = message.payload?.headers || [];
  return {
    id: message.id || "",
    subject: headers.find((h) => h.name === "Subject")?.value || "",
    from: headers.find((h) => h.name === "From")?.value || "",
    date: headers.find((h) => h.name === "Date")?.value || "",
  };
}

/**
 * Extract plain text body from Gmail message
 */
export function extractEmailBody(message: gmail_v1.Schema$Message): string {
  const payload = message.payload as GmailMessagePart | undefined;
  if (!payload) return message.snippet || "";

  // Helper to decode base64url
  const decodeBase64 = (data: string | undefined): string => {
    if (!data) return "";
    return Buffer.from(data, "base64").toString("utf-8");
  };

  // Helper to find text/plain part recursively
  const findTextPart = (part: GmailMessagePart): string | null => {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64(part.body.data);
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        const text = findTextPart(subPart);
        if (text) return text;
      }
    }
    return null;
  };

  // Try to find text/plain content
  let textContent = findTextPart(payload);

  // If no text/plain, try text/html and strip tags
  if (!textContent) {
    const findHtmlPart = (part: GmailMessagePart): string | null => {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const html = findHtmlPart(subPart);
          if (html) return html;
        }
      }
      return null;
    };

    const htmlContent = findHtmlPart(payload);
    if (htmlContent) {
      // Basic HTML to text conversion
      textContent = htmlContent
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();
    }
  }

  // Fallback to snippet if no body found
  if (!textContent) {
    textContent = message.snippet || "";
  }

  return textContent;
}
