import { onRequest } from "firebase-functions/v2/https";
import { TARGET_LABEL, PUBSUB_TOPIC } from "../config/constants";
import { getGmailClient } from "../services/gmail";
import { processEmailMessages } from "../services/emailProcessor";
import {
  ErrorResponse,
  FetchEmailsResponse,
  LabelsResponse,
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

export const fetchEmails = onRequest(async (req, res): Promise<void> => {
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
    const hoursParam = req.query.hours;
    const parsed =
      typeof hoursParam === "string" ? parseInt(hoursParam, 10) : 24;
    const hours = isNaN(parsed) || parsed < 1 ? 24 : parsed;

    // Calculate the timestamp for "hours" ago
    const afterTimestamp = Math.floor(Date.now() / 1000) - hours * 60 * 60;

    const { gmail } = await getGmailClient();

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      labelIds: [TARGET_LABEL],
      q: `after:${afterTimestamp}`,
    });

    const messages = listResponse.data.messages ?? [];

    if (messages.length === 0) {
      const response: FetchEmailsResponse = {
        success: true,
        message: `No emails found in the target label (${TARGET_LABEL}) from the last ${hours} hour(s)`,
        processed: 0,
      };
      res.json(response);
      return;
    }

    const result = await processEmailMessages(gmail, messages);

    const response: FetchEmailsResponse = {
      success: true,
      message: `Successfully processed ${result.processed} emails from the last ${hours} hour(s)`,
      processed: result.processed,
      emails: result.emails,
    };
    res.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      success: false,
      error: getErrorMessage(error),
      message:
        "Failed to fetch emails. Check Gmail API access and target label configuration.",
    };
    res.status(500).json(errorResponse);
  }
});
