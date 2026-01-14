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

export const renewWatch = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;
  requireEnvVars(["PUBSUB_TOPIC", "TARGET_LABEL"]);

  try {
    const { gmail } = await getGmailClient();

    const result = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: [TARGET_LABEL],
      },
    });

    const expirationMs = parseInt(result.data.expiration ?? "0", 10);
    const expirationDate = new Date(expirationMs).toISOString();
    const expiresIn = Math.round(
      (expirationMs - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const response: WatchResponse = {
      success: true,
      message: `Gmail watch subscription renewed successfully. Expires in ${expiresIn} days.`,
      expiration: result.data.expiration ?? undefined,
      expirationDate,
    };
    res.json(response);
  } catch (err) {
    const response: WatchResponse = {
      success: false,
      error: getErrorMessage(err),
      message:
        "Failed to renew Gmail watch subscription. Check Gmail API credentials and Pub/Sub topic configuration.",
    };
    res.status(500).json(response);
  }
});

export const getLabels = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;

  try {
    const { gmail } = await getGmailClient();

    const response = await gmail.users.labels.list({
      userId: "me",
    });

    const labels = (response.data.labels ?? []).map((label) => ({
      id: label.id ?? "",
      name: label.name ?? "",
    }));

    const result: LabelsResponse = {
      success: true,
      message: `Found ${labels.length} Gmail labels`,
      count: labels.length,
      labels,
    };
    res.json(result);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      success: false,
      error: getErrorMessage(error),
      message:
        "Failed to fetch Gmail labels. Ensure Gmail API access is authorized.",
    };
    res.status(500).json(errorResponse);
  }
});

export const testProcessEmails = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;
  requireEnvVars(["TARGET_LABEL"]);

  try {
    const countParam = req.query.count;
    const parsed =
      typeof countParam === "string" ? parseInt(countParam, 10) : 3;
    const maxResults = isNaN(parsed) || parsed < 1 ? 3 : Math.min(parsed, 20);

    const { gmail } = await getGmailClient();

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      labelIds: [TARGET_LABEL],
    });

    const messages = listResponse.data.messages ?? [];

    if (messages.length === 0) {
      const response: TestProcessEmailsResponse = {
        success: true,
        message: `No emails found in the target label (${TARGET_LABEL})`,
        processed: 0,
      };
      res.json(response);
      return;
    }

    const result = await processEmailMessages(gmail, messages);

    const response: TestProcessEmailsResponse = {
      success: true,
      message: `Successfully processed ${result.processed} emails from target label`,
      processed: result.processed,
      emails: result.emails,
    };
    res.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      success: false,
      error: getErrorMessage(error),
      message:
        "Failed to process test emails. Check Gmail API access and target label configuration.",
    };
    res.status(500).json(errorResponse);
  }
});
