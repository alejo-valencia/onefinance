/**
 * Gmail webhook handler - processes incoming email notifications
 */

import { onRequest } from "firebase-functions/v2/https";
import { TARGET_LABEL } from "../config/constants";
import { getGmailClient } from "../services/gmail";
import { getGmailConfigRef } from "../services/email";
import { processEmailMessages } from "../services/emailProcessor";
import { GmailPubSubNotification, PubSubMessage } from "../types";
import { gmail_v1 } from "googleapis";
import { requireEnvVars } from "../utils";

/**
 * Handles Gmail Pub/Sub notifications for new emails
 */
export const gmailWebhook = onRequest(async (req, res): Promise<void> => {
  console.log("📬 Gmail webhook triggered");

  try {
    requireEnvVars(["TARGET_LABEL"]);
    const message = req.body.message as PubSubMessage | undefined;
    if (!message?.data) {
      console.log("⚠️ No message data received");
      res.status(400).send("No message data");
      return;
    }

    const decodedData: GmailPubSubNotification = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );
    console.log("📧 Gmail notification received:", {
      emailAddress: decodedData.emailAddress,
      historyId: decodedData.historyId,
    });

    const { historyId } = decodedData;
    const { gmail, lastHistoryId } = await getGmailClient();

    console.log("📜 Fetching message history...");
    console.log(
      `   Last historyId: ${lastHistoryId ?? "none"}, Current: ${historyId}`
    );

    let messages: gmail_v1.Schema$Message[] = [];
    try {
      const historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId: lastHistoryId ?? historyId,
        historyTypes: ["messageAdded"],
        labelId: TARGET_LABEL,
      });

      if (historyResponse.data.history) {
        console.log(
          `📋 Found ${historyResponse.data.history.length} history records`
        );

        for (const record of historyResponse.data.history) {
          if (record.messagesAdded) {
            const labeledMessages = record.messagesAdded
              .map((m) => m.message)
              .filter(
                (m): m is gmail_v1.Schema$Message =>
                  m !== undefined &&
                  m.labelIds != null &&
                  m.labelIds.includes(TARGET_LABEL)
              );
            messages.push(...labeledMessages);
          }
        }
        console.log(`📨 Found ${messages.length} new labeled messages`);
      } else {
        console.log("📭 No new messages in history");
      }
    } catch {
      console.log("⚠️ History not available, fetching recent messages instead");
      const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        labelIds: [TARGET_LABEL],
      });
      messages = (listResponse.data.messages ??
        []) as gmail_v1.Schema$Message[];
      console.log(`📨 Fetched ${messages.length} recent messages`);
    }

    if (messages.length === 0) {
      console.log("✅ No messages to process");
    } else {
      // Process emails using shared utility
      const result = await processEmailMessages(gmail, messages);
      console.log(`✅ Processed ${result.processed} emails`);
    }

    console.log("💾 Updating lastHistoryId in Firestore...");
    await getGmailConfigRef().update({ lastHistoryId: historyId });
    console.log("✅ Webhook processed successfully");

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error processing gmail webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});
