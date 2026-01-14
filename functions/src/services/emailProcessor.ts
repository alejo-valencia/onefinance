/**
 * Email processing service - shared logic for processing Gmail messages
 */

import { gmail_v1 } from "googleapis";
import { extractEmailHeaders, extractEmailBody } from "./gmail";
import { saveEmail } from "./email";
import { ProcessedEmail, hasValidId } from "../types";

/**
 * Result of processing emails
 */
export interface EmailProcessingResult {
  processed: number;
  emails: ProcessedEmail[];
}

/**
 * Process a list of Gmail messages - fetch full content, extract data, and save to Firestore
 *
 * @param gmail - Authenticated Gmail client
 * @param messages - List of message stubs to process
 * @returns Processing result with count and processed email details
 */
export async function processEmailMessages(
  gmail: gmail_v1.Gmail,
  messages: gmail_v1.Schema$Message[]
): Promise<EmailProcessingResult> {
  // Filter messages with valid IDs before fetching
  const validMessages = messages.filter(hasValidId);

  if (validMessages.length === 0) {
    return { processed: 0, emails: [] };
  }

  console.log(
    `🔄 Fetching full content for ${validMessages.length} messages...`
  );

  // Fetch full content for all messages in parallel
  const fullMessageResults = await Promise.allSettled(
    validMessages.map((msg) =>
      gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      })
    )
  );

  const fullMessages = fullMessageResults
    .map((result, index) => ({ result, id: validMessages[index]?.id }))
    .filter(
      (
        item
      ): item is {
        result: PromiseFulfilledResult<gmail_v1.Schema$Message>;
        id: string;
      } => item.result.status === "fulfilled" && !!item.id
    )
    .map((item) => item.result.value);

  const failedMessages = fullMessageResults.filter(
    (result) => result.status === "rejected"
  );
  if (failedMessages.length > 0) {
    console.warn(
      `⚠️ ${failedMessages.length} email fetches failed; continuing with successful messages`
    );
  }

  const processedEmails: ProcessedEmail[] = [];

  console.log("📧 Processing emails:");
  for (const fullMessage of fullMessages) {
    const emailData = extractEmailHeaders(fullMessage.data);
    const bodyText = extractEmailBody(fullMessage.data);

    console.log(`   ✉️ Email: ${emailData.id}`);
    console.log(`      📝 Body length: ${bodyText.length} chars`);

    // Store email in Firestore
    console.log(`   💾 Saving email to Firestore...`);
    await saveEmail(emailData, bodyText);
    console.log(`   ✅ Email ${emailData.id} saved`);

    processedEmails.push({
      id: emailData.id,
      subject: emailData.subject,
      from: emailData.from,
      date: emailData.date,
      bodyPreview: bodyText.substring(0, 200),
    });
  }

  return {
    processed: processedEmails.length,
    emails: processedEmails,
  };
}
