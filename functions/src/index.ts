import * as admin from "firebase-admin";

admin.initializeApp();

import { authGmail, oauthCallback } from "./handlers/auth";
import { gmailWebhook } from "./handlers/webhook";
import { renewWatch, getLabels, fetchEmails } from "./handlers/admin";
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
  processEmailQueue,
  getProcessStatus,
  scheduledProcessQueue,
  unprocessAllEmails,
};
