import * as admin from "firebase-admin";
import { EmailDocument, EmailHeaders, COLLECTIONS } from "../types";

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

    const emailDoc: EmailDocument = {
      subject: emailData.subject,
      from: emailData.from,
      date: emailData.date,
      body: bodyText,
      receivedAt:
        existingData?.receivedAt ??
        admin.firestore.FieldValue.serverTimestamp(),
      processed: existingData?.processed ?? false,
      processing: existingData?.processing ?? false,
      processingStartedAt: existingData?.processingStartedAt,
    };

    tx.set(docRef, emailDoc, { merge: true });
  });
}

export function getGmailConfigRef(): FirebaseFirestore.DocumentReference {
  return admin.firestore().collection(COLLECTIONS.CONFIG).doc("gmail");
}
