/**
 * Admin handlers - utility endpoints for managing Gmail integration
 */

import { onRequest } from "firebase-functions/v2/https";
import { TARGET_LABEL, PUBSUB_TOPIC } from "../config/constants";
import { getGmailClient } from "../services/gmail";
import { processEmailMessages } from "../services/emailProcessor";
import {
  ErrorResponse,
  LabelsResponse,
  TestProcessEmailsResponse,
  WatchResponse,
} from "../types";
import { getErrorMessage, validateAuth, requireEnvVars } from "../utils";

/**
 * Renews the Gmail watch subscription
 */
export const renewWatch = onRequest(async (req, res): Promise<void> => {
  if (!validateAuth(req, res)) return;
  requireEnvVars(["PUBSUB_TOPIC", "TARGET_LABEL"]);

  console.log("🔄 Renewing Gmail watch subscription...");

  try {
    const { gmail } = await getGmailClient();

    console.log("📡 Calling Gmail watch API...");
    const result = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: [TARGET_LABEL],
      },
    });

    const expiration = new Date(
      parseInt(result.data.expiration ?? "0", 10)
    ).toISOString();
    console.log(`✅ Watch renewed successfully!`);
    console.log(`   ⏰ Expires: ${expiration}`);

    const response: WatchResponse = {
      success: true,
      expiration: result.data.expiration ?? undefined,
      expirationDate: expiration,
    };
    res.json(response);
  } catch (err) {
    console.error("❌ Renew watch error:", err);
    const response: WatchResponse = {
      success: false,
      error: getErrorMessage(err),
    };
    res.status(500).json(response);
  }
});

/**
 * Lists all Gmail labels for the authenticated user
 */
export const getLabels = onRequest(async (req, res): Promise<void> => {
  if (!validateAuth(req, res)) return;

  console.log("🏷️ Fetching Gmail labels...");

  try {
    const { gmail } = await getGmailClient();

    console.log("📋 Calling Gmail labels API...");
    const response = await gmail.users.labels.list({
      userId: "me",
    });

    const labels = (response.data.labels ?? []).map((label) => ({
      id: label.id ?? "",
      name: label.name ?? "",
    }));

    console.log(`✅ Found ${labels.length} labels`);
    labels.forEach((label) => {
      console.log(`   🏷️ ${label.name} (${label.id})`);
    });

    const result: LabelsResponse = { labels };
    res.json(result);
  } catch (error) {
    console.error("❌ Error fetching labels:", error);
    const errorResponse: ErrorResponse = { error: getErrorMessage(error) };
    res.status(500).json(errorResponse);
  }
});

/**
 * Test function - processes recent emails from the target label
 * Use this to test email processing without waiting for new emails
 */
export const testProcessEmails = onRequest(async (req, res): Promise<void> => {
  if (!validateAuth(req, res)) return;
  requireEnvVars(["TARGET_LABEL"]);

  console.log("🧪 Test: Processing recent emails from target label...");

  try {
    const countParam = req.query.count;
    const parsed =
      typeof countParam === "string" ? parseInt(countParam, 10) : 3;
    const maxResults = isNaN(parsed) || parsed < 1 ? 3 : Math.min(parsed, 20);
    console.log(`📧 Fetching last ${maxResults} emails...`);

    const { gmail } = await getGmailClient();

    // Fetch recent messages from the target label
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      labelIds: [TARGET_LABEL],
    });

    const messages = listResponse.data.messages ?? [];
    console.log(`📨 Found ${messages.length} emails`);

    if (messages.length === 0) {
      const response: TestProcessEmailsResponse = {
        success: true,
        message: "No emails found in the target label",
        processed: 0,
      };
      res.json(response);
      return;
    }

    // Process emails using shared utility
    const result = await processEmailMessages(gmail, messages);

    console.log(`✅ Test completed! Processed ${result.processed} emails`);

    const response: TestProcessEmailsResponse = {
      success: true,
      processed: result.processed,
      emails: result.emails,
    };
    res.json(response);
  } catch (error) {
    console.error("❌ Test error:", error);
    const errorResponse: ErrorResponse = { error: getErrorMessage(error) };
    res.status(500).json(errorResponse);
  }
});
