/**
 * OneFinance Dashboard - Express Server
 * Serves static files and provides configuration API
 */

require("dotenv").config();

const express = require("express");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Configuration (for client-side SDK)
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "";
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN || "";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";

// The only authorized email for authentication (set via environment variable)
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || "";

// Base URL for Firebase Functions (set via environment variable)
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || "";

// Initialize Firebase Admin SDK for token verification
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: FIREBASE_PROJECT_ID,
  });
}

// Validate required environment variables
if (!AUTHORIZED_EMAIL) {
  console.warn("⚠️  AUTHORIZED_EMAIL environment variable is not set!");
}
if (!FUNCTIONS_BASE_URL) {
  console.warn("⚠️  FUNCTIONS_BASE_URL environment variable is not set!");
}
if (!FIREBASE_API_KEY || !FIREBASE_AUTH_DOMAIN || !FIREBASE_PROJECT_ID) {
  console.warn("⚠️  Firebase configuration is incomplete!");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

/**
 * API endpoint to provide client configuration
 * This allows the frontend to get the Firebase config without embedding it in HTML
 */
app.get("/api/config", (req, res) => {
  res.json({
    firebaseApiKey: FIREBASE_API_KEY,
    firebaseAuthDomain: FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: FIREBASE_PROJECT_ID,
    authorizedEmail: AUTHORIZED_EMAIL,
    functionsBaseUrl: FUNCTIONS_BASE_URL,
  });
});

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Legacy auth page - redirect to main page
 */
app.get("/auth", (req, res) => {
  res.redirect("/");
});

/**
 * Catch-all route - serve index.html for client-side routing
 */
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 OneFinance Dashboard running at http://localhost:${PORT}`);
  console.log(`📧 Functions Base URL: ${FUNCTIONS_BASE_URL}`);
  console.log(`🔐 Authorized Email: ${AUTHORIZED_EMAIL}`);
});
