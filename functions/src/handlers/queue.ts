/**
 * Email queue processor - processes unprocessed emails
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { COLLECTIONS, ErrorResponse } from "../types";
import { getErrorMessage, validateAuth } from "../utils";
import {
  processTransactionWithAgents,
  detectInternalMovements,
  TransactionSummary,
} from "../services/openai";

/**
 * Maximum timeout for processing functions (9 minutes = 540 seconds)
 */
const MAX_TIMEOUT_SECONDS = 540;

/**
 * Safety buffer before timeout to allow graceful shutdown (30 seconds)
 */
const TIMEOUT_BUFFER_MS = 30 * 1000;

/**
 * Default number of emails to process per batch
 */
const DEFAULT_BATCH_SIZE = 10;

/**
 * Processing lock timeout (15 minutes)
 */
const PROCESSING_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * HTTP function options with maximum timeout
 */
const httpOptions: HttpsOptions = {
  timeoutSeconds: MAX_TIMEOUT_SECONDS,
  memory: "512MiB",
};

/**
 * Process job status
 */
type ProcessJobStatus = "pending" | "running" | "completed" | "failed";

/**
 * Process job document stored in Firestore
 */
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

/**
 * Response for starting a process job
 */
interface StartProcessResponse {
  success: boolean;
  jobId: string;
  message: string;
}

/**
 * Response for getting process status
 */
interface ProcessStatusResponse {
  success: boolean;
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

/**
 * Response for unprocess endpoint
 */
interface UnprocessResponse {
  success: boolean;
  updated: number;
  error?: string;
}

/**
 * Attempt to claim an email for processing to avoid duplicate work
 */
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

/**
 * Release processing lock for an email
 */
async function releaseEmailProcessing(emailId: string): Promise<void> {
  await admin.firestore().collection(COLLECTIONS.EMAILS).doc(emailId).update({
    processing: false,
    processingStartedAt: admin.firestore.FieldValue.delete(),
  });
}

/**
 * Process a single email document
 * Runs both classification and categorization agents in parallel
 * Stores the combined result in the transactions collection
 */
async function processEmailDocument(
  emailId: string,
  emailData: FirebaseFirestore.DocumentData
): Promise<void> {
  console.log(`   🔄 Processing email: ${emailId}`);

  const subject = emailData.subject as string;
  const body = emailData.body as string;

  // Run both agents in parallel
  console.log(`   🤖 Running classification and categorization agents...`);
  const result = await processTransactionWithAgents(subject, body);

  console.log(
    `   📊 Classification complete (should_track: ${result.classification.should_track})`
  );

  // Store the transaction result with classification, categorization, and time extraction
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

  console.log(`   💾 Transaction ${transactionId} saved`);

  // Mark email as processed
  await admin.firestore().collection(COLLECTIONS.EMAILS).doc(emailId).update({
    processed: true,
    processing: false,
    processingStartedAt: admin.firestore.FieldValue.delete(),
  });

  console.log(`   ✅ Email ${emailId} marked as processed`);
}

/**
 * Result of queue processing
 */
interface QueueProcessResult {
  processed: number;
  remaining: number;
  timedOut: boolean;
  internalMovementsDetected: number;
}

/**
 * Detect and flag internal movements among recent transactions
 * Looks for transactions that haven't been checked for internal movements yet
 */
async function detectAndFlagInternalMovements(): Promise<number> {
  console.log("\n🔍 Starting internal movement detection...");

  // Get all transactions that:
  // 1. Have should_track = true
  // 2. Haven't been checked for internal movements (internal_movement_checked != true)
  const snapshot = await admin
    .firestore()
    .collection(COLLECTIONS.TRANSACTIONS)
    .where("classification.should_track", "==", true)
    .where("internal_movement_checked", "==", false)
    .get();

  if (snapshot.empty) {
    console.log(
      "📋 No unchecked transactions to analyze for internal movements"
    );
    return 0;
  }

  console.log(
    `📋 Found ${snapshot.size} transactions to analyze for internal movements`
  );

  // Get the email bodies for each transaction
  const transactions: TransactionSummary[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const emailId = data.emailId as string;

    // Get the email body
    const emailDoc = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .doc(emailId)
      .get();

    if (!emailDoc.exists) {
      console.warn(
        `   ⚠️ Email ${emailId} not found for transaction ${doc.id}`
      );
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
    console.log("📋 No valid transactions to analyze");
    return 0;
  }

  // Run the internal movement detection agent
  const result = await detectInternalMovements(transactions);

  console.log(`🔗 Detected ${result.pairs.length} internal movement pairs`);

  // Update all transactions: mark as checked, and flag internal movements
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
  console.log(
    `✅ Updated ${snapshot.size} transactions (${internalMovementIds.size} flagged as internal movements)`
  );

  return internalMovementIds.size;
}

/**
 * Core queue processing logic - shared between HTTP and scheduled functions
 * @param limit - Maximum number of emails to process
 * @param startTime - Start time to check for timeout
 * @param timeoutMs - Timeout in milliseconds
 */
async function runQueueProcessor(
  limit: number = DEFAULT_BATCH_SIZE,
  startTime: number = Date.now(),
  timeoutMs: number = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS
): Promise<QueueProcessResult> {
  console.log(`📬 Processing email queue (limit: ${limit})...`);

  // Query for unprocessed emails
  const snapshot = await admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .where("processed", "==", false)
    .limit(limit)
    .get();

  console.log(`📋 Found ${snapshot.size} unprocessed emails`);

  if (snapshot.empty) {
    // Still run internal movement detection even if no new emails
    const internalMovementsDetected = await detectAndFlagInternalMovements();
    return {
      processed: 0,
      remaining: 0,
      timedOut: false,
      internalMovementsDetected,
    };
  }

  let processedCount = 0;
  let timedOut = false;

  for (const doc of snapshot.docs) {
    // Check if we're approaching timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      console.log(
        `⏱️ Approaching timeout after ${elapsed}ms, stopping gracefully`
      );
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
    } catch (error) {
      console.error(`   ❌ Error processing email ${doc.id}:`, error);
      await releaseEmailProcessing(doc.id);
      // Continue with next email
    }
  }

  // Get remaining count
  const remainingSnapshot = await admin
    .firestore()
    .collection(COLLECTIONS.EMAILS)
    .where("processed", "==", false)
    .count()
    .get();
  const remaining = remainingSnapshot.data().count;

  console.log(
    `✅ Queue processing complete! Processed ${processedCount} emails, ${remaining} remaining`
  );

  // Run internal movement detection after processing emails
  let internalMovementsDetected = 0;
  if (!timedOut) {
    try {
      internalMovementsDetected = await detectAndFlagInternalMovements();
    } catch (error) {
      console.error("❌ Error detecting internal movements:", error);
    }
  }

  return {
    processed: processedCount,
    remaining,
    timedOut,
    internalMovementsDetected,
  };
}

/**
 * Run queue processing for a specific job, updating progress in Firestore
 * @param jobId - The job ID to track progress
 * @param limit - Maximum number of emails to process
 */
async function runJobProcessor(jobId: string, limit: number): Promise<void> {
  const jobRef = admin
    .firestore()
    .collection(COLLECTIONS.PROCESS_JOBS)
    .doc(jobId);
  const startTime = Date.now();
  const timeoutMs = MAX_TIMEOUT_SECONDS * 1000 - TIMEOUT_BUFFER_MS;

  try {
    // Mark job as running
    await jobRef.update({
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Query for unprocessed emails
    const snapshot = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .where("processed", "==", false)
      .limit(limit)
      .get();

    const total = snapshot.size;
    console.log(`📋 Found ${total} unprocessed emails for job ${jobId}`);

    // Update job with total count
    await jobRef.update({ total });

    if (snapshot.empty) {
      // Still run internal movement detection even if no new emails
      const internalMovementsDetected = await detectAndFlagInternalMovements();
      await jobRef.update({
        status: "completed",
        processed: 0,
        remaining: 0,
        internalMovementsDetected,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    let processedCount = 0;
    let timedOut = false;

    for (const doc of snapshot.docs) {
      // Check if we're approaching timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        console.log(`⏱️ Job ${jobId} approaching timeout after ${elapsed}ms`);
        timedOut = true;
        break;
      }

      const claimed = await claimEmailForProcessing(doc.id);
      if (!claimed) {
        continue;
      }

      try {
        // Update current email being processed
        await jobRef.update({
          currentEmail: doc.id,
        });

        await processEmailDocument(doc.id, doc.data());
        processedCount++;

        // Update progress
        await jobRef.update({
          processed: processedCount,
        });
      } catch (error) {
        console.error(`   ❌ Error processing email ${doc.id}:`, error);
        await releaseEmailProcessing(doc.id);
        // Continue with next email
      }
    }

    // Get remaining count
    const remainingSnapshot = await admin
      .firestore()
      .collection(COLLECTIONS.EMAILS)
      .where("processed", "==", false)
      .count()
      .get();
    const remaining = remainingSnapshot.data().count;

    // Run internal movement detection after processing emails
    let internalMovementsDetected = 0;
    if (!timedOut) {
      try {
        internalMovementsDetected = await detectAndFlagInternalMovements();
      } catch (error) {
        console.error("❌ Error detecting internal movements:", error);
      }
    }

    // Mark job as completed
    await jobRef.update({
      status: timedOut ? "completed" : "completed",
      processed: processedCount,
      remaining,
      internalMovementsDetected,
      currentEmail: admin.firestore.FieldValue.delete(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `✅ Job ${jobId} completed: ${processedCount}/${total} emails processed`
    );
  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    await jobRef.update({
      status: "failed",
      error: getErrorMessage(error),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Scheduled function that runs twice a day (every 12 hours)
 * Automatically processes unprocessed emails with timeout handling
 */
export const scheduledProcessQueue = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/New_York",
    timeoutSeconds: MAX_TIMEOUT_SECONDS,
    memory: "512MiB",
  },
  async (): Promise<void> => {
    const startTime = Date.now();
    console.log("⏰ Scheduled queue processing started");

    try {
      // Process up to 100 emails per scheduled run
      const result = await runQueueProcessor(100, startTime);

      if (result.timedOut) {
        console.log(
          `⏱️ Scheduled processing timed out. Processed: ${result.processed}, Remaining: ${result.remaining}`
        );
        // Don't throw - let the next cron job continue
      } else {
        console.log(
          `✅ Scheduled processing complete: ${result.processed} emails, ${result.remaining} remaining`
        );
      }
    } catch (error) {
      console.error("❌ Scheduled processing error:", error);
      // Don't throw to allow graceful handling
    }
  }
);

/**
 * HTTP endpoint to manually trigger queue processing (async)
 * Returns immediately with a job ID that can be used to track progress
 * Accepts ?limit=N query param to control batch size (default: 10)
 */
export const processEmailQueue = onRequest(
  httpOptions,
  async (req, res): Promise<void> => {
    if (!validateAuth(req, res)) return;

    try {
      // Parse limit from query param
      const limitParam = req.query.limit;
      const limit =
        typeof limitParam === "string"
          ? parseInt(limitParam, 10)
          : DEFAULT_BATCH_SIZE;
      const validLimit =
        isNaN(limit) || limit < 1 ? DEFAULT_BATCH_SIZE : Math.min(limit, 100);

      // Create a new job document
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

      console.log(`📬 Created job ${jobId} (limit: ${validLimit})`);

      // Start processing in the background (don't await)
      runJobProcessor(jobId, validLimit).catch((error) => {
        console.error(`❌ Background job ${jobId} failed:`, error);
      });

      const response: StartProcessResponse = {
        success: true,
        jobId,
        message: `Processing started. Use /getProcessStatus?jobId=${jobId} to track progress.`,
      };
      res.json(response);
    } catch (error) {
      console.error("❌ Error starting queue processing:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

/**
 * HTTP endpoint to get the status of a processing job
 * Requires ?jobId=... query param
 */
export const getProcessStatus = onRequest(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (req, res): Promise<void> => {
    if (!validateAuth(req, res)) return;

    try {
      const jobId = req.query.jobId;
      if (!jobId || typeof jobId !== "string") {
        res.status(400).json({
          success: false,
          error: "Missing required query parameter: jobId",
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
          error: `Job ${jobId} not found`,
        });
        return;
      }

      const data = jobDoc.data() as ProcessJob;

      const response: ProcessStatusResponse = {
        success: true,
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
      console.error("❌ Error getting process status:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

/**
 * Test endpoint to mark all emails as unprocessed
 * Useful for testing the queue processor
 */
export const unprocessAllEmails = onRequest(
  httpOptions,
  async (req, res): Promise<void> => {
    if (!validateAuth(req, res)) return;

    console.log("🔄 Marking all emails as unprocessed...");

    try {
      const snapshot = await admin
        .firestore()
        .collection(COLLECTIONS.EMAILS)
        .where("processed", "==", true)
        .get();

      console.log(`📋 Found ${snapshot.size} processed emails to reset`);

      if (snapshot.empty) {
        const response: UnprocessResponse = {
          success: true,
          updated: 0,
        };
        res.json(response);
        return;
      }

      // Use batched writes for efficiency
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

      console.log(`✅ Reset ${snapshot.size} emails to unprocessed`);

      const response: UnprocessResponse = {
        success: true,
        updated: snapshot.size,
      };
      res.json(response);
    } catch (error) {
      console.error("❌ Error resetting emails:", error);
      const errorResponse: ErrorResponse = { error: getErrorMessage(error) };
      res.status(500).json(errorResponse);
    }
  }
);
