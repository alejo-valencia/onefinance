import { gmail_v1 } from "googleapis";
import { extractEmailHeaders, extractEmailBody } from "./gmail";
import { saveEmail } from "./email";
import { ProcessedEmail, hasValidId } from "../types";

export interface EmailProcessingResult {
  processed: number;
  skipped: number;
  emails: ProcessedEmail[];
}

export async function processEmailMessages(
  gmail: gmail_v1.Gmail,
  messages: gmail_v1.Schema$Message[],
): Promise<EmailProcessingResult> {
  const validMessages = messages.filter(hasValidId);

  if (validMessages.length === 0) {
    return { processed: 0, skipped: 0, emails: [] };
  }

  const fullMessageResults = await Promise.allSettled(
    validMessages.map((msg) =>
      gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      }),
    ),
  );

  const fullMessages: gmail_v1.Schema$Message[] = [];

  for (const result of fullMessageResults) {
    if (result.status === "fulfilled" && result.value.data) {
      fullMessages.push(result.value.data);
    }
  }

  const processedEmails: ProcessedEmail[] = [];
  let skipped = 0;

  for (const fullMessage of fullMessages) {
    const emailData = extractEmailHeaders(fullMessage);
    const bodyText = extractEmailBody(fullMessage);

    const saved = await saveEmail(emailData, bodyText);

    if (saved) {
      processedEmails.push({
        id: emailData.id,
        subject: emailData.subject,
        from: emailData.from,
        date: emailData.date,
        bodyPreview: bodyText.substring(0, 200),
      });
    } else {
      skipped++;
    }
  }

  return {
    processed: processedEmails.length,
    skipped,
    emails: processedEmails,
  };
}
