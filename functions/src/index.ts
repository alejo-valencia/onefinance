import * as admin from "firebase-admin";

admin.initializeApp();

import { authGmail, oauthCallback } from "./handlers/auth";
import { gmailWebhook } from "./handlers/webhook";
import { renewWatch, getLabels, fetchEmails } from "./handlers/admin";
import { getTransactions } from "./handlers/transactions";
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
  fetchEmails,
  getTransactions,
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
};
