import { onRequest } from "firebase-functions/v2/https";
import { TARGET_LABEL } from "../config/constants";
import { getGmailClient } from "../services/gmail";
import { getGmailConfigRef } from "../services/email";
import { processEmailMessages } from "../services/emailProcessor";
import { GmailPubSubNotification, PubSubMessage } from "../types";
import { gmail_v1 } from "googleapis";
import { requireEnvVars } from "../utils";

export const gmailWebhook = onRequest(async (req, res): Promise<void> => {
  try {
    requireEnvVars(["TARGET_LABEL"]);
    const message = req.body.message as PubSubMessage | undefined;
    if (!message?.data) {
      res.status(400).send("No message data");
      return;
    }

    const decodedData: GmailPubSubNotification = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );

    const { historyId } = decodedData;
    const { gmail, lastHistoryId } = await getGmailClient();

    let messages: gmail_v1.Schema$Message[] = [];
    try {
      const historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId: lastHistoryId ?? historyId,
        historyTypes: ["messageAdded"],
        labelId: TARGET_LABEL,
      });

      if (historyResponse.data.history) {
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
      }
    } catch {
      const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        labelIds: [TARGET_LABEL],
      });
      messages = (listResponse.data.messages ??
        []) as gmail_v1.Schema$Message[];
    }

    if (messages.length > 0) {
      await processEmailMessages(gmail, messages);
    }

    await getGmailConfigRef().update({ lastHistoryId: historyId });

    res.status(200).send("OK");
  } catch {
    res.status(500).send("Error processing webhook");
  }
});
