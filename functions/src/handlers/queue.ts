import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { COLLECTIONS, LogEntry } from "../types";
import { getErrorMessage, validateAuth, isFirestoreIndexError } from "../utils";
import { processTransactionWithAgents } from "../services/openai";

const MAX_TIMEOUT_SECONDS = 540;
const TIMEOUT_BUFFER_MS = 30 * 1000;
const DEFAULT_BATCH_SIZE = 10;
const PARALLEL_PROCESSING_LIMIT = 1; // Process one email at a time, agents run in parallel
const PROCESSING_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const httpOptions: HttpsOptions = {
  timeoutSeconds: MAX_TIMEOUT_SECONDS,
  memory: "1GiB",
};

type ProcessJobStatus = "pending" | "running" | "completed" | "failed";

interface ProcessJob {
  status: ProcessJobStatus;
  processed: number;
  total: number;
  remaining: number;
  currentEmail?: string;
  error?: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  startedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  logs?: LogEntry[];
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

    const logEntry: LogEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      event: "processing_started",
      details: {
        lockExpiredAndReclaimed: lockExpired,
      },
    };

    tx.update(emailRef, {
      processing: true,
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: admin.firestore.FieldValue.arrayUnion(logEntry),
    });

    return true;
  });
}

async function releaseEmailProcessing(emailId: string): Promise<void> {
  const releaseLog: LogEntry = {
    timestamp: admin.firestore.Timestamp.now(),
    event: "processing_released",
    details: {
      reason: "error_during_processing",
    },
  };

  await admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .doc(emailId)
    .update({
      processing: false,
      processingStartedAt: admin.firestore.FieldValue.delete(),
      logs: admin.firestore.FieldValue.arrayUnion(releaseLog),
    });
}

async function processEmailDocument(
  emailId: string,
  emailData: FirebaseFirestore.DocumentData,
): Promise<void> {
  const subject = emailData.subject as string;
  const body = emailData.body as string;

  const aiProcessingStartTime = Date.now();
  const result = await processTransactionWithAgents(subject, body);
  const aiProcessingDurationMs = Date.now() - aiProcessingStartTime;

  const transactionId = uuidv4();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const logTimestamp = admin.firestore.Timestamp.now();

  const transactionLog: LogEntry = {
    timestamp: logTimestamp,
    event: "transaction_created",
    details: {
      emailId,
      aiProcessingDurationMs,
      classification: result.classification,
      categorization: result.categorization,
    },
  };

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
      createdAt: now,
      logs: [transactionLog],
    });

  const emailCompletionLog: LogEntry = {
    timestamp: logTimestamp,
    event: "processing_completed",
    details: {
      transactionId,
      aiProcessingDurationMs,
      shouldTrack: result.classification.should_track,
    },
  };

  await admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .doc(emailId)
    .update({
      processed: true,
      processing: false,
      processingStartedAt: admin.firestore.FieldValue.delete(),
      processedAt: now,
      logs: admin.firestore.FieldValue.arrayUnion(emailCompletionLog),
    });
}

interface QueueProcessResult {
  processed: number;
  remaining: number;
  timedOut: boolean;
  indexError?: string;
}

async function processEmailBatch(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<number> {
  const processingPromises = docs.map(async (doc) => {
    const claimed = await claimEmailForProcessing(doc.id);
    if (!claimed) {
      return false;
    }

    try {
      await processEmailDocument(doc.id, doc.data());
      return true;
    } catch (error) {
      console.error(
        `Error processing email ${doc.id}:`,
        getErrorMessage(error),
      );
      await releaseEmailProcessing(doc.id);
      return false;
    }
  });

  const results = await Promise.all(processingPromises);
  return results.filter(Boolean).length;
}

async function runQueueProcessor(
  limit: number = DEFAULT_BATCH_SIZE,
  startTime: number = Date.now(),
  timeoutMs: number = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS,
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
        indexError: getErrorMessage(error),
      };
    }
    throw error;
  }

  if (snapshot.empty) {
    return {
      processed: 0,
      remaining: 0,
      timedOut: false,
    };
  }

  let processedCount = 0;
  let timedOut = false;

  // Process emails in parallel batches
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += PARALLEL_PROCESSING_LIMIT) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      timedOut = true;
      break;
    }

    const batch = docs.slice(i, i + PARALLEL_PROCESSING_LIMIT);
    const batchProcessed = await processEmailBatch(batch);
    processedCount += batchProcessed;
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

  return {
    processed: processedCount,
    remaining: remainingCount,
    timedOut,
  };
}

async function runJobProcessor(jobId: string): Promise<void> {
  const jobRef = admin
    .firestore()
    .collection(COLLECTIONS.PROCESS_JOBS)
    .doc(jobId);
  const startTime = Date.now();
  const timeoutMs = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS;

  try {
    const runningLog: LogEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      event: "job_started",
      details: {},
    };

    await jobRef.update({
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: admin.firestore.FieldValue.arrayUnion(runningLog),
    });

    let snapshot;
    try {
      snapshot = await admin
        .firestore()
        .collection(COLLECTIONS.EMAILS)
        .where("processed", "==", false)
        .get();
    } catch (error) {
      if (isFirestoreIndexError(error)) {
        const failedLog: LogEntry = {
          timestamp: admin.firestore.Timestamp.now(),
          event: "job_failed",
          details: {
            reason: "firestore_index_error",
            error: getErrorMessage(error),
          },
        };

        await jobRef.update({
          status: "failed",
          error: getErrorMessage(error),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          logs: admin.firestore.FieldValue.arrayUnion(failedLog),
        });
        return;
      }
      throw error;
    }

    const total = snapshot.size;

    await jobRef.update({ total });

    if (snapshot.empty) {
      const completedLog: LogEntry = {
        timestamp: admin.firestore.Timestamp.now(),
        event: "job_completed",
        details: {
          reason: "no_emails_to_process",
          durationMs: Date.now() - startTime,
        },
      };

      await jobRef.update({
        status: "completed",
        processed: 0,
        remaining: 0,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        logs: admin.firestore.FieldValue.arrayUnion(completedLog),
      });
      return;
    }

    let processedCount = 0;
    let timedOut = false;

    // Process emails in parallel batches
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += PARALLEL_PROCESSING_LIMIT) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        timedOut = true;
        break;
      }

      const batchDocs = docs.slice(i, i + PARALLEL_PROCESSING_LIMIT);

      await jobRef.update({
        currentEmail: `Processing batch ${
          Math.floor(i / PARALLEL_PROCESSING_LIMIT) + 1
        }/${Math.ceil(docs.length / PARALLEL_PROCESSING_LIMIT)}`,
      });

      const batchProcessed = await processEmailBatch(batchDocs);
      processedCount += batchProcessed;

      await jobRef.update({
        processed: processedCount,
      });
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

    const completedLog: LogEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      event: "job_completed",
      details: {
        processedCount,
        remainingCount,
        timedOut,
        durationMs: Date.now() - startTime,
      },
    };

    await jobRef.update({
      status: "completed",
      processed: processedCount,
      remaining: remainingCount,
      currentEmail: admin.firestore.FieldValue.delete(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: admin.firestore.FieldValue.arrayUnion(completedLog),
    });
  } catch (error) {
    const failedLog: LogEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      event: "job_failed",
      details: {
        error: getErrorMessage(error),
        durationMs: Date.now() - startTime,
      },
    };

    await jobRef.update({
      status: "failed",
      error: getErrorMessage(error),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: admin.firestore.FieldValue.arrayUnion(failedLog),
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
  },
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
      const jobId = uuidv4();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const createdLog: LogEntry = {
        timestamp: admin.firestore.Timestamp.now(),
        event: "job_created",
        details: {
          triggeredBy: "http_request",
        },
      };

      const jobData: ProcessJob = {
        status: "pending",
        processed: 0,
        total: 0,
        remaining: 0,
        createdAt: now,
        logs: [createdLog],
      };

      await admin
        .firestore()
        .collection(COLLECTIONS.PROCESS_JOBS)
        .doc(jobId)
        .set(jobData);

      runJobProcessor(jobId).catch(() => {
        // Background job errors are stored in the job document
      });

      const response: StartProcessResponse = {
        success: true,
        jobId,
        message: `Email queue processing started. Track progress using the job ID.`,
      };
      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to start email queue processing",
      });
    }
  },
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
      let jobId = req.query.jobId;
      let jobDoc;

      if (!jobId || typeof jobId !== "string") {
        // Find the latest running or pending job
        const runningSnapshot = await admin
          .firestore()
          .collection(COLLECTIONS.PROCESS_JOBS)
          .where("status", "in", ["pending", "running"])
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();

        if (runningSnapshot.empty) {
          // No running jobs, get the most recent completed/failed job
          const latestSnapshot = await admin
            .firestore()
            .collection(COLLECTIONS.PROCESS_JOBS)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

          if (latestSnapshot.empty) {
            res.status(404).json({
              success: false,
              error: "No jobs found",
              message: "No processing jobs found. Start a new job first.",
            });
            return;
          }

          jobDoc = latestSnapshot.docs[0];
          jobId = jobDoc.id;
        } else {
          jobDoc = runningSnapshot.docs[0];
          jobId = jobDoc.id;
        }
      } else {
        jobDoc = await admin
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
      }

      const data = (jobDoc.data ? jobDoc.data() : jobDoc) as ProcessJob;

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
  },
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
  },
);
