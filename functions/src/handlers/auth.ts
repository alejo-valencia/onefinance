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

export const authGmail = onRequest(async (req, res): Promise<void> => {
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

  const authUrl = generateAuthUrl();
  res.json({
    success: true,
    message: "Gmail authorization URL generated. Open this URL to authorize.",
    authUrl,
  });
});

export const oauthCallback = onRequest(async (req, res): Promise<void> => {
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
      res.status(400).json({
        success: false,
        error: "Missing authorization code",
        message: "No authorization code was received from Google OAuth",
      });
      return;
    }

    const tokens = await getTokensFromCode(code);

    console.log("OAuth tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      tokenType: tokens.token_type,
    });

    if (!tokens.refresh_token) {
      console.warn("WARNING: No refresh_token received from Google OAuth!");
    }

    const gmailConfig: GmailConfig = { tokens };
    await getGmailConfigRef().set(gmailConfig, { merge: true });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const watchResult = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: [TARGET_LABEL],
      },
    });

    const expirationMs = parseInt(watchResult.data.expiration ?? "0", 10);
    const expiresIn = Math.round(
      (expirationMs - Date.now()) / (1000 * 60 * 60 * 24),
    );

    res.send(`
      <html>
        <head><title>Authorization Successful</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1 style="color: #4CAF50;">✅ Authorized Successfully!</h1>
          <p>Gmail integration is now active.</p>
          <p>Watch subscription expires in ${expiresIn} days.</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <html>
        <head><title>Authorization Failed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1 style="color: #f44336;">❌ Authorization Failed</h1>
          <p>${getErrorMessage(error)}</p>
          <p>Please try again or check the server logs.</p>
        </body>
      </html>
    `);
  }
});
