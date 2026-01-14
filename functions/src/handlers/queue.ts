import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { COLLECTIONS } from "../types";
import { getErrorMessage, validateAuth, isFirestoreIndexError } from "../utils";
import {
  processTransactionWithAgents,
  detectInternalMovements,
  TransactionSummary,
} from "../services/openai";

const MAX_TIMEOUT_SECONDS = 540;
const TIMEOUT_BUFFER_MS = 30 * 1000;
const DEFAULT_BATCH_SIZE = 10;
const PROCESSING_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const httpOptions: HttpsOptions = {
  timeoutSeconds: MAX_TIMEOUT_SECONDS,
  memory: "512MiB",
};

type ProcessJobStatus = "pending" | "running" | "completed" | "failed";

interface ProcessJob {
  status: ProcessJobStatus;
  limit: number;
  processed: number;
  total: number;
  remaining: number;
  currentEmail?: string;
  internalMovementsDetected: number;
  error?: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  startedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface StartProcessResponse {
  success: boolean;
  jobId: string;
  message: string;
}

interface ProcessStatusResponse {
  success: boolean;
  message?: string;
  jobId: string;
  status: ProcessJobStatus;
  processed: number;
  total: number;
  remaining: number;
  internalMovementsDetected: number;
  currentEmail?: string;
  error?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface UnprocessResponse {
  success: boolean;
  message?: string;
  updated: number;
  error?: string;
}

async function claimEmailForProcessing(emailId: string): Promise<boolean> {
  const emailRef = admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .doc(emailId);

  return admin.firestore().runTransaction(async (tx) => {
    const doc = await tx.get(emailRef);
    if (!doc.exists) return false;

    const data = doc.data() as
      | {
          processed?: boolean;
          processing?: boolean;
          processingStartedAt?: admin.firestore.Timestamp;
        }
      | undefined;
    const processed = data?.processed === true;
    const processing = data?.processing === true;

    let lockExpired = false;
    if (
      processing &&
      data?.processingStartedAt instanceof admin.firestore.Timestamp
    ) {
      const startedAt = data.processingStartedAt.toMillis();
      lockExpired = Date.now() - startedAt > PROCESSING_LOCK_TIMEOUT_MS;
    }

    if (processed || (processing && !lockExpired)) {
      return false;
    }

    tx.update(emailRef, {
      processing: true,
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return true;
  });
}

async function releaseEmailProcessing(emailId: string): Promise<void> {
  await admin.firestore().collection(COLLECTIONS.EMAILS).doc(emailId).update({
    processing: false,
    processingStartedAt: admin.firestore.FieldValue.delete(),
  });
}

async function processEmailDocument(
  emailId: string,
  emailData: FirebaseFirestore.DocumentData
): Promise<void> {
  const subject = emailData.subject as string;
  const body = emailData.body as string;

  const result = await processTransactionWithAgents(subject, body);

  const transactionId = uuidv4();
  await admin
    .firestore()
    .collection(COLLECTIONS.TRANSACTIONS)
    .doc(transactionId)
    .set({
      emailId,
      emailSubject: subject,
      classification: result.classification,
      categorization: result.categorization,
      timeExtraction: result.timeExtraction,
      internal_movement: false,
      internal_movement_checked: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await admin.firestore().collection(COLLECTIONS.EMAILS).doc(emailId).update({
    processed: true,
    processing: false,
    processingStartedAt: admin.firestore.FieldValue.delete(),
  });
}

interface QueueProcessResult {
  processed: number;
  remaining: number;
  timedOut: boolean;
  internalMovementsDetected: number;
  indexError?: string;
}

async function detectAndFlagInternalMovements(): Promise<{
  count: number;
  indexError?: string;
}> {
  let snapshot;
  try {
    snapshot = await admin
      .firestore()
      .collection(COLLECTIONS.TRANSACTIONS)
      .where("classification.should_track", "==", true)
      .where("internal_movement_checked", "==", false)
      .get();
  } catch (error) {
    if (isFirestoreIndexError(error)) {
      return {
        count: 0,
        indexError: getErrorMessage(error),
      };
    }
    throw error;
  }

  if (snapshot.empty) {
    return { count: 0 };
  }

  const transactions: TransactionSummary[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const emailId = data.emailId as string;

    const emailDoc = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .doc(emailId)
      .get();

    if (!emailDoc.exists) {
      continue;
    }

    const emailData = emailDoc.data();
    const emailBody = (emailData?.body as string) || "";

    transactions.push({
      id: doc.id,
      amount: data.classification?.transaction?.amount || 0,
      type: data.classification?.transaction?.type || "unknown",
      transaction_datetime: data.timeExtraction?.transaction_datetime || null,
      emailBody,
    });
  }

  if (transactions.length === 0) {
    return { count: 0 };
  }

  const result = await detectInternalMovements(transactions);

  const internalMovementIds = new Set(result.internal_movement_ids);
  let batch = admin.firestore().batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const isInternal = internalMovementIds.has(doc.id);
    batch.update(doc.ref, {
      internal_movement: isInternal,
      internal_movement_checked: true,
    });
    batchCount++;

    if (batchCount >= 450) {
      await batch.commit();
      batch = admin.firestore().batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { count: internalMovementIds.size };
}

async function runQueueProcessor(
  limit: number = DEFAULT_BATCH_SIZE,
  startTime: number = Date.now(),
  timeoutMs: number = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS
): Promise<QueueProcessResult> {
  let snapshot;
  try {
    snapshot = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .where("processed", "==", false)
      .limit(limit)
      .get();
  } catch (error) {
    if (isFirestoreIndexError(error)) {
      return {
        processed: 0,
        remaining: 0,
        timedOut: false,
        internalMovementsDetected: 0,
        indexError: getErrorMessage(error),
      };
    }
    throw error;
  }

  if (snapshot.empty) {
    const internalResult = await detectAndFlagInternalMovements();
    return {
      processed: 0,
      remaining: 0,
      timedOut: false,
      internalMovementsDetected: internalResult.count,
      indexError: internalResult.indexError,
    };
  }

  let processedCount = 0;
  let timedOut = false;

  for (const doc of snapshot.docs) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      timedOut = true;
      break;
    }

    const claimed = await claimEmailForProcessing(doc.id);
    if (!claimed) {
      continue;
    }

    try {
      await processEmailDocument(doc.id, doc.data());
      processedCount++;
    } catch {
      await releaseEmailProcessing(doc.id);
    }
  }

  let remainingCount = 0;
  try {
    const remainingSnapshot = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .where("processed", "==", false)
      .count()
      .get();
    remainingCount = remainingSnapshot.data().count;
  } catch {
    // Ignore count errors
  }

  let internalMovementsDetected = 0;
  let indexError: string | undefined;
  if (!timedOut) {
    const internalResult = await detectAndFlagInternalMovements();
    internalMovementsDetected = internalResult.count;
    indexError = internalResult.indexError;
  }

  return {
    processed: processedCount,
    remaining: remainingCount,
    timedOut,
    internalMovementsDetected,
    indexError,
  };
}

async function runJobProcessor(jobId: string, limit: number): Promise<void> {
  const jobRef = admin
    .firestore()
    .collection(COLLECTIONS.PROCESS_JOBS)
    .doc(jobId);
  const startTime = Date.now();
  const timeoutMs = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS;

  try {
    await jobRef.update({
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let snapshot;
    try {
      snapshot = await admin
        .firestore()
        .collection(COLLECTIONS.EMAILS)
        .where("processed", "==", false)
        .limit(limit)
        .get();
    } catch (error) {
      if (isFirestoreIndexError(error)) {
        await jobRef.update({
          status: "failed",
          error: getErrorMessage(error),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }
      throw error;
    }

    const total = snapshot.size;

    await jobRef.update({ total });

    if (snapshot.empty) {
      const internalResult = await detectAndFlagInternalMovements();
      await jobRef.update({
        status: "completed",
        processed: 0,
        remaining: 0,
        internalMovementsDetected: internalResult.count,
        error: internalResult.indexError,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    let processedCount = 0;
    let timedOut = false;

    for (const doc of snapshot.docs) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        timedOut = true;
        break;
      }

      const claimed = await claimEmailForProcessing(doc.id);
      if (!claimed) {
        continue;
      }

      try {
        await jobRef.update({
          currentEmail: doc.id,
        });

        await processEmailDocument(doc.id, doc.data());
        processedCount++;

        await jobRef.update({
          processed: processedCount,
        });
      } catch {
        await releaseEmailProcessing(doc.id);
      }
    }

    let remainingCount = 0;
    try {
      const remainingSnapshot = await admin
        .firestore()
        .collection(COLLECTIONS.EMAILS)
        .where("processed", "==", false)
        .count()
        .get();
      remainingCount = remainingSnapshot.data().count;
    } catch {
      // Ignore count errors
    }

    let internalMovementsDetected = 0;
    let indexError: string | undefined;
    if (!timedOut) {
      const internalResult = await detectAndFlagInternalMovements();
      internalMovementsDetected = internalResult.count;
      indexError = internalResult.indexError;
    }

    await jobRef.update({
      status: "completed",
      processed: processedCount,
      remaining: remainingCount,
      internalMovementsDetected,
      error: indexError,
      currentEmail: admin.firestore.FieldValue.delete(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await jobRef.update({
      status: "failed",
      error: getErrorMessage(error),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const scheduledProcessQueue = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/New_York",
    timeoutSeconds: MAX_TIMEOUT_SECONDS,
    memory: "512MiB",
  },
  async (): Promise<void> => {
    const startTime = Date.now();

    try {
      await runQueueProcessor(100, startTime);
    } catch {
      // Don't throw to allow graceful handling
    }
  }
);

export const processEmailQueue = onRequest(
  httpOptions,
  async (req, res): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (!(await validateAuth(req, res))) return;

    try {
      const limitParam = req.query.limit;
      const limit =
        typeof limitParam === "string"
          ? parseInt(limitParam, 10)
          : DEFAULT_BATCH_SIZE;
      const validLimit =
        isNaN(limit) || limit < 1 ? DEFAULT_BATCH_SIZE : Math.min(limit, 100);

      const jobId = uuidv4();
      const jobData: ProcessJob = {
        status: "pending",
        limit: validLimit,
        processed: 0,
        total: 0,
        remaining: 0,
        internalMovementsDetected: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await admin
        .firestore()
        .collection(COLLECTIONS.PROCESS_JOBS)
        .doc(jobId)
        .set(jobData);

      runJobProcessor(jobId, validLimit).catch(() => {
        // Background job errors are stored in the job document
      });

      const response: StartProcessResponse = {
        success: true,
        jobId,
        message: `Email queue processing started with limit of ${validLimit}. Track progress using the job ID.`,
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to start email queue processing",
      });
    }
  }
);

export const getProcessStatus = onRequest(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (req, res): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (!(await validateAuth(req, res))) return;

    try {
      const jobId = req.query.jobId;
      if (!jobId || typeof jobId !== "string") {
        res.status(400).json({
          success: false,
          error: "Invalid request",
          message: "Missing required query parameter: jobId",
        });
        return;
      }

      const jobDoc = await admin
        .firestore()
        .collection(COLLECTIONS.PROCESS_JOBS)
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        res.status(404).json({
          success: false,
          error: "Job not found",
          message: `No processing job found with ID: ${jobId}`,
        });
        return;
      }

      const data = jobDoc.data() as ProcessJob;

      const statusMessages: Record<ProcessJobStatus, string> = {
        pending: "Job is queued and waiting to start",
        running: `Processing in progress. ${data.processed} emails completed so far.`,
        completed: `Processing finished. ${data.processed} emails processed, ${data.remaining} remaining.`,
        failed: `Processing failed: ${data.error || "Unknown error"}`,
      };

      const response: ProcessStatusResponse = {
        success: true,
        message: statusMessages[data.status],
        jobId,
        status: data.status,
        processed: data.processed,
        total: data.total,
        remaining: data.remaining,
        internalMovementsDetected: data.internalMovementsDetected,
        currentEmail: data.currentEmail,
        error: data.error,
        createdAt:
          data.createdAt instanceof admin.firestore.Timestamp
            ? data.createdAt.toDate().toISOString()
            : undefined,
        startedAt:
          data.startedAt instanceof admin.firestore.Timestamp
            ? data.startedAt.toDate().toISOString()
            : undefined,
        completedAt:
          data.completedAt instanceof admin.firestore.Timestamp
            ? data.completedAt.toDate().toISOString()
            : undefined,
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to retrieve job status",
      });
    }
  }
);

export const unprocessAllEmails = onRequest(
  httpOptions,
  async (req, res): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (!(await validateAuth(req, res))) return;

    try {
      let snapshot;
      try {
        snapshot = await admin
          .firestore()
          .collection(COLLECTIONS.EMAILS)
          .where("processed", "==", true)
          .get();
      } catch (error) {
        if (isFirestoreIndexError(error)) {
          res.status(500).json({
            success: false,
            error: getErrorMessage(error),
            message:
              "Firestore index required. Click the link in the error to create it.",
          });
          return;
        }
        throw error;
      }

      if (snapshot.empty) {
        const response: UnprocessResponse = {
          success: true,
          message: "No processed emails found to reset",
          updated: 0,
        };
        res.json(response);
        return;
      }

      let batch = admin.firestore().batch();
      let batchCount = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
          processed: false,
          processing: false,
          processingStartedAt: admin.firestore.FieldValue.delete(),
        });
        batchCount++;

        if (batchCount >= 450) {
          await batch.commit();
          batch = admin.firestore().batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      const response: UnprocessResponse = {
        success: true,
        message: `Successfully reset ${snapshot.size} emails to unprocessed state`,
        updated: snapshot.size,
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to reset emails to unprocessed state",
      });
    }
  }
);
