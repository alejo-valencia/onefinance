import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { COLLECTIONS } from "../types";
import { validateAuth, getErrorMessage } from "../utils";

export const getTransactions = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;

  try {
    const { startDate, endDate, limit } = req.query;
    let query = admin.firestore().collection(COLLECTIONS.TRANSACTIONS);

    let queryRef: FirebaseFirestore.Query = query;

    if (startDate && endDate) {
      // Assuming startDate and endDate are ISO strings
      // and checking against the string field stored in Firestore
      queryRef = queryRef
        .where("timeExtraction.transaction_datetime", ">=", startDate)
        .where("timeExtraction.transaction_datetime", "<=", endDate);
    }

    // Default to ordering by date descending
    queryRef = queryRef.orderBy("timeExtraction.transaction_datetime", "desc");

    if (limit) {
      queryRef = queryRef.limit(Number(limit));
    } else if (!startDate || !endDate) {
      // Default limit if no date range specified to avoid fetching everything
      queryRef = queryRef.limit(100);
    }

    const snapshot = await queryRef.get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ success: true, transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export const updateTransaction = onRequest(async (req, res): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!(await validateAuth(req, res))) return;

  try {
    const { transactionId, category, subcategory, confirmed } = req.body;

    if (!transactionId) {
      res
        .status(400)
        .json({ success: false, error: "transactionId is required" });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (category !== undefined) {
      updateData["categorization.category"] = category;
    }
    if (subcategory !== undefined) {
      updateData["categorization.subcategory"] = subcategory;
    }
    if (confirmed !== undefined) {
      updateData["confirmed"] = confirmed;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ success: false, error: "No fields to update" });
      return;
    }

    await admin
      .firestore()
      .collection(COLLECTIONS.TRANSACTIONS)
      .doc(transactionId)
      .update(updateData);

    res.json({ success: true, message: "Transaction updated successfully" });
  } catch (error) {
    console.error("Error updating transaction:", error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});
