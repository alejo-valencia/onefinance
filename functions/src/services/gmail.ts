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

oauth2Client.on(
  "tokens",
  async (newTokens: Auth.Credentials): Promise<void> => {
    try {
      const doc = await getGmailConfigRef().get();
      if (doc.exists) {
        const data = doc.data() as GmailConfig | undefined;
        const currentTokens = data?.tokens ?? {};
        const updatedTokens = { ...currentTokens, ...newTokens };
        await getGmailConfigRef().update({ tokens: updatedTokens });
      }
    } catch {
      // Token save failed - will retry on next refresh
    }
  }
);

function isTokenExpiredOrExpiring(tokens: GmailTokens): boolean {
  if (!tokens.expiry_date) {
    return true;
  }

  const now = Date.now();
  const expiresAt = tokens.expiry_date;

  return now >= expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

async function ensureValidToken(tokens: GmailTokens): Promise<void> {
  if (!isTokenExpiredOrExpiring(tokens)) {
    return;
  }

  if (!tokens.refresh_token) {
    throw new Error("No refresh token available. Please re-authorize the app.");
  }

  oauth2Client.setCredentials(tokens);

  const { token } = await oauth2Client.getAccessToken();

  if (!token) {
    throw new Error("Failed to refresh access token");
  }
}

export async function getGmailClient(): Promise<GmailClientResult> {
  ensureGmailOAuthEnv();
  const doc = await getGmailConfigRef().get();

  if (!doc.exists) {
    throw new Error(
      "Gmail not configured. Please authorize first via the dashboard."
    );
  }

  const data = doc.data() as GmailConfig | undefined;
  if (!data?.tokens) {
    throw new Error(
      "Gmail tokens not found. Please authorize first via the dashboard."
    );
  }

  await ensureValidToken(data.tokens);

  oauth2Client.setCredentials(data.tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  return { gmail, lastHistoryId: data.lastHistoryId };
}

export function generateAuthUrl(): string {
  ensureGmailOAuthEnv();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export async function getTokensFromCode(code: string): Promise<GmailTokens> {
  ensureGmailOAuthEnv();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens as GmailTokens;
}

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

export function extractEmailBody(message: gmail_v1.Schema$Message): string {
  const payload = message.payload as GmailMessagePart | undefined;
  if (!payload) return message.snippet || "";

  const decodeBase64 = (data: string | undefined): string => {
    if (!data) return "";
    return Buffer.from(data, "base64").toString("utf-8");
  };

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

  let textContent = findTextPart(payload);

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

  if (!textContent) {
    textContent = message.snippet || "";
  }

  return textContent;
}
