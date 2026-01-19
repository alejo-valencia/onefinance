import * as admin from "firebase-admin";
import { EmailDocument, EmailHeaders, COLLECTIONS, LogEntry } from "../types";

export async function saveEmail(
  emailData: EmailHeaders,
  bodyText: string,
): Promise<boolean> {
  const docRef = admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .doc(emailData.id);

  const existing = await docRef.get();
  if (existing.exists) {
    return false;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  const logEntry: LogEntry = {
    timestamp: admin.firestore.Timestamp.now(),
    event: "email_received",
    details: {
      from: emailData.from,
      subject: emailData.subject,
      emailDate: emailData.date,
    },
  };

  const emailDoc: EmailDocument = {
    subject: emailData.subject,
    from: emailData.from,
    date: emailData.date,
    body: bodyText,
    receivedAt: now,
    processed: false,
    processing: false,
    logs: [logEntry],
  };

  await docRef.set(emailDoc);
  return true;
}

export function getGmailConfigRef(): FirebaseFirestore.DocumentReference {
  return admin.firestore().collection(COLLECTIONS.CONFIG).doc("gmail");
}
