import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { COLLECTIONS, SyncStatusDocument, SyncStatus } from "../types";
import { getErrorMessage, validateAuth, requireEnvVars } from "../utils";
import { TARGET_LABEL } from "../config/constants";
import { getGmailClient } from "../services/gmail";
import { processEmailMessages } from "../services/emailProcessor";

const MAX_TIMEOUT_SECONDS = 540;
const SYNC_STATUS_DOC_ID = "current";
const EXTRA_HOURS_BUFFER = 6;

const httpOptions: HttpsOptions = {
  timeoutSeconds: MAX_TIMEOUT_SECONDS,
  memory: "1GiB",
};

interface SyncEmailResponse {
  success: boolean;
  message?: string;
  syncId?: string;
  hoursToFetch?: number;
  totalEmailsFetched?: number;
  newEmails?: number;
  existingEmails?: number;
  error?: string;
}

interface SyncStatusResponse {
  success: boolean;
  status: SyncStatus;
  triggeredAt?: string;
  completedAt?: string;
  hoursToFetch: number;
  totalEmailsFetched: number;
  newEmails: number;
  existingEmails: number;
  emailsQueued: number;
  emailsProcessed: number;
  emailsRemaining: number;
  error?: string;
}

function getSyncStatusRef(): FirebaseFirestore.DocumentReference {
  return admin
    .firestore()
    .collection(COLLECTIONS.SYNC_STATUS)
    .doc(SYNC_STATUS_DOC_ID);
}

async function getLastSyncTime(): Promise<Date | null> {
  const doc = await getSyncStatusRef().get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as SyncStatusDocument | undefined;
  if (!data?.triggeredAt) {
    return null;
  }

  // Convert Firestore Timestamp to Date
  if (data.triggeredAt instanceof admin.firestore.Timestamp) {
    return data.triggeredAt.toDate();
  }

  return null;
}

function calculateHoursToFetch(lastSyncTime: Date | null): number {
  const now = new Date();

  if (!lastSyncTime) {
    // First sync: calculate hours since beginning of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const hoursSinceMonthStart = Math.ceil(
      (now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60),
    );
    return hoursSinceMonthStart + EXTRA_HOURS_BUFFER;
  }

  // Calculate hours since last sync + buffer
  const hoursSinceLastSync = Math.ceil(
    (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60),
  );
  return hoursSinceLastSync + EXTRA_HOURS_BUFFER;
}

async function getUnprocessedEmailCount(): Promise<number> {
  const snapshot = await admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .where("processed", "==", false)
    .count()
    .get();
  return snapshot.data().count;
}

export const syncFromMail = onRequest(
  httpOptions,
  async (req, res): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (!(await validateAuth(req, res))) return;
    requireEnvVars(["TARGET_LABEL"]);

    try {
      // Check if a sync is already running
      const currentSyncDoc = await getSyncStatusRef().get();
      if (currentSyncDoc.exists) {
        const currentData = currentSyncDoc.data() as
          | SyncStatusDocument
          | undefined;
        if (
          currentData?.status === "fetching" ||
          currentData?.status === "processing"
        ) {
          const response: SyncEmailResponse = {
            success: false,
            error: "A sync is already in progress",
            message: "Please wait for the current sync to complete",
          };
          res.status(409).json(response);
          return;
        }
      }

      // Calculate hours to fetch
      const lastSyncTime = await getLastSyncTime();
      const hoursToFetch = calculateHoursToFetch(lastSyncTime);

      // Update sync status to fetching
      const syncStatusData: SyncStatusDocument = {
        status: "fetching",
        triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
        hoursToFetch,
        totalEmailsFetched: 0,
        newEmails: 0,
        existingEmails: 0,
        emailsQueued: 0,
        emailsProcessed: 0,
        emailsRemaining: 0,
      };

      await getSyncStatusRef().set(syncStatusData);

      // Fetch emails
      const afterTimestamp =
        Math.floor(Date.now() / 1000) - hoursToFetch * 60 * 60;
      const { gmail } = await getGmailClient();

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        labelIds: [TARGET_LABEL],
        q: `after:${afterTimestamp}`,
      });

      const messages = listResponse.data.messages ?? [];
      const totalEmailsFetched = messages.length;

      if (messages.length === 0) {
        // No emails found, update status to completed
        await getSyncStatusRef().update({
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalEmailsFetched: 0,
          newEmails: 0,
          existingEmails: 0,
          emailsQueued: 0,
          emailsProcessed: 0,
          emailsRemaining: 0,
        });

        const response: SyncEmailResponse = {
          success: true,
          message: `No emails found in the last ${hoursToFetch} hours`,
          hoursToFetch,
          totalEmailsFetched: 0,
          newEmails: 0,
          existingEmails: 0,
        };
        res.json(response);
        return;
      }

      // Process and save emails
      const result = await processEmailMessages(gmail, messages);
      const newEmails = result.processed;
      const existingEmails = result.skipped;

      // Get current queue state
      const emailsRemaining = await getUnprocessedEmailCount();

      // Update sync status to processing
      await getSyncStatusRef().update({
        status: "processing",
        totalEmailsFetched,
        newEmails,
        existingEmails,
        emailsQueued: newEmails,
        emailsRemaining,
      });

      const response: SyncEmailResponse = {
        success: true,
        message: `Fetched ${totalEmailsFetched} emails: ${newEmails} new, ${existingEmails} already saved. ${emailsRemaining} emails queued for processing.`,
        hoursToFetch,
        totalEmailsFetched,
        newEmails,
        existingEmails,
      };
      res.json(response);
    } catch (error) {
      // Update sync status to failed
      await getSyncStatusRef().update({
        status: "failed",
        error: getErrorMessage(error),
      });

      const response: SyncEmailResponse = {
        success: false,
        error: getErrorMessage(error),
        message:
          "Failed to sync emails. Check Gmail API access and configuration.",
      };
      res.status(500).json(response);
    }
  },
);

export const getSyncStatus = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;

  try {
    const doc = await getSyncStatusRef().get();

    if (!doc.exists) {
      const response: SyncStatusResponse = {
        success: true,
        status: "idle",
        hoursToFetch: 0,
        totalEmailsFetched: 0,
        newEmails: 0,
        existingEmails: 0,
        emailsQueued: 0,
        emailsProcessed: 0,
        emailsRemaining: 0,
      };
      res.json(response);
      return;
    }

    const data = doc.data() as SyncStatusDocument;

    // Get live counts for processing status
    let emailsRemaining = 0;
    let status = data.status;

    if (data.status === "processing" || data.status === "fetching") {
      emailsRemaining = await getUnprocessedEmailCount();

      // Check if processing is complete
      if (emailsRemaining === 0 && data.status === "processing") {
        status = "completed";
        await getSyncStatusRef().update({
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          emailsRemaining: 0,
          emailsProcessed: data.emailsQueued,
        });
      }
    }

    const triggeredAt =
      data.triggeredAt instanceof admin.firestore.Timestamp
        ? data.triggeredAt.toDate().toISOString()
        : undefined;

    const completedAt =
      data.completedAt instanceof admin.firestore.Timestamp
        ? data.completedAt.toDate().toISOString()
        : undefined;

    const emailsProcessed = data.emailsQueued - emailsRemaining;

    const response: SyncStatusResponse = {
      success: true,
      status,
      triggeredAt,
      completedAt,
      hoursToFetch: data.hoursToFetch,
      totalEmailsFetched: data.totalEmailsFetched,
      newEmails: data.newEmails,
      existingEmails: data.existingEmails,
      emailsQueued: data.emailsQueued,
      emailsProcessed: emailsProcessed > 0 ? emailsProcessed : 0,
      emailsRemaining,
      error: data.error,
    };
    res.json(response);
  } catch (error) {
    const response = {
      success: false,
      error: getErrorMessage(error),
      message: "Failed to get sync status",
    };
    res.status(500).json(response);
  }
});
