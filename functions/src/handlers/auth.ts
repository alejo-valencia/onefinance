/**
 * Auth handlers - OAuth flow endpoints
 */

import { onRequest } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { TARGET_LABEL, PUBSUB_TOPIC } from "../config/constants";
import {
  oauth2Client,
  generateAuthUrl,
  getTokensFromCode,
} from "../services/gmail";
import { getGmailConfigRef } from "../services/email";
import { GmailConfig } from "../types";
import { getErrorMessage, validateAuth, requireEnvVars } from "../utils";

/**
 * Initiates Gmail OAuth flow
 * Returns the auth URL as JSON for the frontend to open
 */
export const authGmail = onRequest(async (req, res): Promise<void> => {
  // Set CORS headers for the frontend
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;
  requireEnvVars([
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REDIRECT_URI",
  ]);

  console.log("🚀 Starting Gmail authorization flow...");
  const authUrl = generateAuthUrl();
  console.log("➡️ Returning auth URL to client...");
  res.json({ authUrl });
});

/**
 * OAuth callback - handles the authorization code and sets up watch
 */
export const oauthCallback = onRequest(async (req, res): Promise<void> => {
  console.log("📥 OAuth callback received");

  try {
    requireEnvVars([
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REDIRECT_URI",
      "PUBSUB_TOPIC",
      "TARGET_LABEL",
    ]);
    const code = req.query.code;
    if (typeof code !== "string") {
      console.error("❌ No authorization code received");
      res.status(400).send("No authorization code");
      return;
    }

    console.log("🔄 Processing authorization code...");
    const tokens = await getTokensFromCode(code);

    console.log("💾 Saving tokens to Firestore...");
    const gmailConfig: GmailConfig = { tokens };
    await getGmailConfigRef().set(gmailConfig);
    console.log("✅ Tokens saved");

    console.log("📡 Setting up Gmail watch...");
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const watchResult = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: [TARGET_LABEL],
      },
    });
    console.log(
      "✅ Watch set up successfully, expires:",
      watchResult.data.expiration
    );

    res.send("✅ Authorized successfully!");
  } catch (error) {
    console.error("❌ OAuth callback error:", error);
    res.status(500).send("Authorization failed: " + getErrorMessage(error));
  }
});
