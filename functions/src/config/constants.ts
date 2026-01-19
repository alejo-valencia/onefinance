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

export const ASSISTANT_IDS = {
  categorization: "asst_yHWFXBknB6wU9jBzRN142Zwl",
  classification: "asst_3IWaeFYb9iM8XmDLz5NcsaaS",
  internalMovement: "asst_GcdDahUvHSrXA0pDIb5O0zZo",
  timeExtraction: "asst_0pu7Z1XZZTUlz0vMDeFakSe3",
};
