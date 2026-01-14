/**
 * Type definitions for OneFinance Gmail Integration
 */

import { gmail_v1 } from "googleapis";

// =============================================================================
// Firestore Collection Names
// =============================================================================

export const COLLECTIONS = {
  CONFIG: "config",
  EMAILS: "emails",
  TRANSACTIONS: "transactions",
  PROCESS_JOBS: "process_jobs",
} as const;

export const CONFIG_DOCS = {
  GMAIL: "gmail",
} as const;

// =============================================================================
// OAuth & Configuration Types
// =============================================================================

/**
 * OAuth configuration for Gmail API
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * OAuth tokens stored in Firestore
 */
export interface GmailTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

/**
 * Gmail configuration document stored in Firestore
 */
export interface GmailConfig {
  tokens: GmailTokens;
  lastHistoryId?: string;
}

/**
 * Extracted email headers
 */
export interface EmailHeaders {
  id: string;
  subject: string;
  from: string;
  date: string;
}

/**
 * Email document stored in Firestore
 */
export interface EmailDocument {
  subject: string;
  from: string;
  date: string;
  body: string;
  receivedAt: FirebaseFirestore.FieldValue;
  processed: boolean;
  processing?: boolean;
  processingStartedAt?: FirebaseFirestore.FieldValue;
}

/**
 * Processed email response for API
 */
export interface ProcessedEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  bodyPreview: string;
}

/**
 * Gmail client with optional history ID
 */
export interface GmailClientResult {
  gmail: gmail_v1.Gmail;
  lastHistoryId?: string;
}

/**
 * Pub/Sub notification data from Gmail
 */
export interface GmailPubSubNotification {
  emailAddress: string;
  historyId: string;
}

/**
 * Pub/Sub message structure
 */
export interface PubSubMessage {
  data: string;
  messageId?: string;
  publishTime?: string;
}

/**
 * Watch renewal response
 */
export interface WatchResponse {
  success: boolean;
  expiration?: string;
  expirationDate?: string;
  error?: string;
}

/**
 * Labels list response
 */
export interface LabelsResponse {
  labels: Array<{
    id: string;
    name: string;
  }>;
  error?: string;
}

/**
 * Test process emails response
 */
export interface TestProcessEmailsResponse {
  success: boolean;
  message?: string;
  processed: number;
  emails?: ProcessedEmail[];
  error?: string;
}

/**
 * Gmail message part (for recursive body extraction)
 */
export interface GmailMessagePart {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: string;
  success?: false;
}

/**
 * Type guard for checking if a message has a valid ID
 */
export function hasValidId(
  msg: gmail_v1.Schema$Message | undefined
): msg is gmail_v1.Schema$Message & { id: string } {
  return msg !== undefined && typeof msg.id === "string";
}
