import { onRequest, HttpsOptions } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { COLLECTIONS, LogEntry } from "../types";
import { getErrorMessage, validateAuth, isFirestoreIndexError } from "../utils";
import {
  detectInternalMovements,
  TransactionSummary,
} from "../services/openai";

const httpOptions: HttpsOptions = {
  timeoutSeconds: 300,
  memory: "512MiB",
};

interface DuplicateDetectionResponse {
  success: boolean;
  message?: string;
  date: string;
  transactionsAnalyzed: number;
  internalMovementsDetected: number;
  pairs: Array<{
    outgoingId: string;
    incomingId: string;
    amount: number;
    datetime: string;
    reason: string;
  }>;
  error?: string;
}

function parseDate(dateStr: string): { start: Date; end: Date } | null {
  // Expected format: YYYY-MM-DD
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[3], 10);

  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day, 23, 59, 59, 999);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  return { start, end };
}

async function detectDuplicatesForDate(
  targetDate: string,
): Promise<DuplicateDetectionResponse> {
  const dateRange = parseDate(targetDate);
  if (!dateRange) {
    return {
      success: false,
      message: "Invalid date format. Use YYYY-MM-DD.",
      date: targetDate,
      transactionsAnalyzed: 0,
      internalMovementsDetected: 0,
      pairs: [],
      error: "INVALID_DATE_FORMAT",
    };
  }

  let snapshot;
  try {
    // Query by timeExtraction.transaction_date which stores the actual transaction date as YYYY-MM-DD string
    snapshot = await admin
      .firestore()
      .collection(COLLECTIONS.TRANSACTIONS)
      .where("classification.should_track", "==", true)
      .where("timeExtraction.transaction_date", "==", targetDate)
      .get();
  } catch (error) {
    if (isFirestoreIndexError(error)) {
      return {
        success: false,
        message:
          "Firestore index required. Click the link in the error to create it.",
        date: targetDate,
        transactionsAnalyzed: 0,
        internalMovementsDetected: 0,
        pairs: [],
        error: getErrorMessage(error),
      };
    }
    throw error;
  }

  if (snapshot.empty) {
    return {
      success: true,
      message: `No transactions found for ${targetDate}`,
      date: targetDate,
      transactionsAnalyzed: 0,
      internalMovementsDetected: 0,
      pairs: [],
    };
  }

  // Build transaction summaries
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
    return {
      success: true,
      message: `No trackable transactions with email bodies found for ${targetDate}`,
      date: targetDate,
      transactionsAnalyzed: 0,
      internalMovementsDetected: 0,
      pairs: [],
    };
  }

  // Run internal movement detection
  const result = await detectInternalMovements(transactions);

  const internalMovementIds = new Set(result.internal_movement_ids);
  let batch = admin.firestore().batch();
  let batchCount = 0;
  const logTimestamp = admin.firestore.Timestamp.now();

  // Update transactions with internal movement flags
  for (const doc of snapshot.docs) {
    const isInternal = internalMovementIds.has(doc.id);
    const matchingPair = isInternal
      ? result.pairs.find(
          (p) => p.outgoing_id === doc.id || p.incoming_id === doc.id,
        )
      : undefined;

    const internalMovementLog: LogEntry = {
      timestamp: logTimestamp,
      event: "duplicate_detection_processed",
      details: {
        isInternalMovement: isInternal,
        pairReason: matchingPair?.reason,
        notes: result.notes,
        targetDate,
      },
    };

    batch.update(doc.ref, {
      internal_movement: isInternal,
      internal_movement_checked: true,
      logs: admin.firestore.FieldValue.arrayUnion(internalMovementLog),
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

  return {
    success: true,
    message: `Analyzed ${transactions.length} transactions for ${targetDate}. Found ${internalMovementIds.size} internal movements.`,
    date: targetDate,
    transactionsAnalyzed: transactions.length,
    internalMovementsDetected: internalMovementIds.size,
    pairs: result.pairs.map((p) => ({
      outgoingId: p.outgoing_id,
      incomingId: p.incoming_id,
      amount: p.amount,
      datetime: p.datetime,
      reason: p.reason,
    })),
  };
}

export const detectDuplicateTransactions = onRequest(
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
      // Get date from query params or body
      const date =
        (req.query.date as string) || (req.body?.date as string) || null;

      if (!date) {
        res.status(400).json({
          success: false,
          error: "MISSING_DATE",
          message:
            "Date parameter is required. Use ?date=YYYY-MM-DD or provide date in request body.",
        });
        return;
      }

      const result = await detectDuplicatesForDate(date);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to detect duplicate transactions",
      });
    }
  },
);

export const resetInternalMovements = onRequest(
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
      // Optional date filter
      const date =
        (req.query.date as string) || (req.body?.date as string) || null;

      let query: FirebaseFirestore.Query = admin
        .firestore()
        .collection(COLLECTIONS.TRANSACTIONS)
        .where("internal_movement_checked", "==", true);

      if (date) {
        const dateRange = parseDate(date);
        if (!dateRange) {
          res.status(400).json({
            success: false,
            error: "INVALID_DATE_FORMAT",
            message: "Invalid date format. Use YYYY-MM-DD.",
          });
          return;
        }

        // Filter by timeExtraction.transaction_date which stores the actual transaction date as YYYY-MM-DD string
        query = query.where("timeExtraction.transaction_date", "==", date);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        res.json({
          success: true,
          message: date
            ? `No checked transactions found for ${date}`
            : "No checked transactions found",
          updated: 0,
        });
        return;
      }

      let batch = admin.firestore().batch();
      let batchCount = 0;
      const logTimestamp = admin.firestore.Timestamp.now();

      for (const doc of snapshot.docs) {
        const resetLog: LogEntry = {
          timestamp: logTimestamp,
          event: "internal_movement_reset",
          details: {
            previouslyChecked: true,
            targetDate: date || "all",
          },
        };

        batch.update(doc.ref, {
          internal_movement: false,
          internal_movement_checked: false,
          logs: admin.firestore.FieldValue.arrayUnion(resetLog),
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

      res.json({
        success: true,
        message: `Reset ${snapshot.size} transactions to unchecked state`,
        updated: snapshot.size,
        date: date || "all",
      });
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

      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: "Failed to reset internal movement flags",
      });
    }
  },
);
