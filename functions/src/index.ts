import * as admin from "firebase-admin";

admin.initializeApp();

import { authGmail, oauthCallback } from "./handlers/auth";
import { gmailWebhook } from "./handlers/webhook";
import { renewWatch, getLabels, fetchEmails } from "./handlers/admin";
import { getTransactions, updateTransaction } from "./handlers/transactions";
import {
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
} from "./handlers/queue";
import {
  detectDuplicateTransactions,
  resetInternalMovements,
} from "./handlers/duplicates";
import { syncFromMail, getSyncStatus } from "./handlers/sync";

export {
  authGmail,
  oauthCallback,
  gmailWebhook,
  renewWatch,
  getLabels,
  fetchEmails,
  getTransactions,
  updateTransaction,
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
  detectDuplicateTransactions,
  resetInternalMovements,
  syncFromMail,
  getSyncStatus,
};
