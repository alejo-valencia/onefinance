import * as admin from "firebase-admin";
import { EmailDocument, EmailHeaders, COLLECTIONS, LogEntry } from "../types";

export async function saveEmail(
  emailData: EmailHeaders,
  bodyText: string
): Promise<void> {
  const docRef = admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .doc(emailData.id);

  await admin.firestore().runTransaction(async (tx) => {
    const existing = await tx.get(docRef);
    const existingData = existing.data() as EmailDocument | undefined;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const isNewEmail = !existing.exists;

    const logEntry: LogEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      event: isNewEmail ? "email_received" : "email_updated",
      details: {
        from: emailData.from,
        subject: emailData.subject,
        emailDate: emailData.date,
      },
    };

    const emailDoc: Partial<EmailDocument> = {
      subject: emailData.subject,
      from: emailData.from,
      date: emailData.date,
      body: bodyText,
      receivedAt: existingData?.receivedAt ?? now,
      processed: existingData?.processed ?? false,
      processing: existingData?.processing ?? false,
      logs: isNewEmail
        ? [logEntry]
        : (admin.firestore.FieldValue.arrayUnion(
            logEntry
          ) as unknown as LogEntry[]),
    };

    // Only include processingStartedAt if it exists in the existing document
    if (existingData?.processingStartedAt !== undefined) {
      emailDoc.processingStartedAt = existingData.processingStartedAt;
    }

    tx.set(docRef, emailDoc, { merge: true });
  });
}

export function getGmailConfigRef(): FirebaseFirestore.DocumentReference {
  return admin.firestore().collection(COLLECTIONS.CONFIG).doc("gmail");
}
