/**
 * OneFinance - Gmail Integration Cloud Functions
 *
 * Functions:
 * - authGmail: Initiates OAuth flow
 * - oauthCallback: Handles OAuth callback
 * - renewWatch: Renews Gmail watch subscription
 * - gmailWebhook: Processes incoming email notifications
 * - getLabels: Lists Gmail labels (for testing)
 * - testProcessEmails: Test processing recent emails
 * - processEmailQueue: Start async queue processing (HTTP)
 * - getProcessStatus: Get status of a processing job (HTTP)
 * - scheduledProcessQueue: Automatic queue processing (every 12 hours)
 * - unprocessAllEmails: Reset all emails to unprocessed (testing)
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin once
admin.initializeApp();
console.log("🔥 Firebase Admin initialized");

// Import and export handlers
import { authGmail, oauthCallback } from "./handlers/auth";
import { gmailWebhook } from "./handlers/webhook";
import { renewWatch, getLabels, testProcessEmails } from "./handlers/admin";
import {
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
} from "./handlers/queue";

export {
  authGmail,
  oauthCallback,
  gmailWebhook,
  renewWatch,
  getLabels,
  testProcessEmails,
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
};

console.log("✅ All Cloud Functions loaded");
