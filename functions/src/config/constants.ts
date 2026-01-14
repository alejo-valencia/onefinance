/**
 * Application constants
 * Loaded from environment variables - see .env.example
 */

import * as dotenv from "dotenv";
import { OAuthConfig } from "../types";

dotenv.config();

export const TARGET_LABEL: string = process.env.TARGET_LABEL || "";
export const PUBSUB_TOPIC: string = process.env.PUBSUB_TOPIC || "";

export const OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.GMAIL_CLIENT_ID || "",
  clientSecret: process.env.GMAIL_CLIENT_SECRET || "",
  redirectUri: process.env.GMAIL_REDIRECT_URI || "",
};

// NOTE: Do not throw on missing env vars at module load time.
// Each handler/service validates only the variables it needs at runtime.
