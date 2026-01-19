import { gmail_v1 } from "googleapis";

export const COLLECTIONS = {
  CONFIG: "config",
  EMAILS: "emails",
  TRANSACTIONS: "transactions",
  PROCESS_JOBS: "process_jobs",
} as const;

export const CONFIG_DOCS = {
  GMAIL: "gmail",
} as const;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GmailTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export interface GmailConfig {
  tokens: GmailTokens;
  lastHistoryId?: string;
}

export interface EmailHeaders {
  id: string;
  subject: string;
  from: string;
  date: string;
}

export interface LogEntry {
  timestamp: FirebaseFirestore.Timestamp;
  event: string;
  details?: Record<string, unknown>;
}

export interface EmailDocument {
  subject: string;
  from: string;
  date: string;
  body: string;
  receivedAt: FirebaseFirestore.FieldValue;
  processed: boolean;
  processing?: boolean;
  processingStartedAt?: FirebaseFirestore.FieldValue;
  processedAt?: FirebaseFirestore.FieldValue;
  logs?: LogEntry[];
}

export interface ProcessedEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  bodyPreview: string;
}

export interface GmailClientResult {
  gmail: gmail_v1.Gmail;
  lastHistoryId?: string;
}

export interface GmailPubSubNotification {
  emailAddress: string;
  historyId: string;
}

export interface PubSubMessage {
  data: string;
  messageId?: string;
  publishTime?: string;
}

export interface WatchResponse {
  success: boolean;
  message?: string;
  expiration?: string;
  expirationDate?: string;
  error?: string;
}

export interface LabelsResponse {
  success?: boolean;
  message?: string;
  count?: number;
  labels: Array<{
    id: string;
    name: string;
  }>;
  error?: string;
}

export interface FetchEmailsResponse {
  success: boolean;
  message?: string;
  processed: number;
  emails?: ProcessedEmail[];
  error?: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
}

export interface ErrorResponse {
  success?: false;
  error: string;
  message?: string;
}

export function hasValidId(
  msg: gmail_v1.Schema$Message | undefined
): msg is gmail_v1.Schema$Message & { id: string } {
  return msg !== undefined && typeof msg.id === "string";
}
