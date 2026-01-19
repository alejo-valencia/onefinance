# 📖 OneFinance - Usage Guide

This comprehensive guide covers all endpoints and features of the OneFinance Gmail integration for automatic transaction tracking.

## 📋 Table of Contents

- [Authentication](#-authentication)
- [Setup Flow](#-setup-flow)
- [API Endpoints](#-api-endpoints)
  - [authGmail](#1-authgmail---start-oauth-flow)
  - [oauthCallback](#2-oauthcallback---oauth-callback)
  - [getLabels](#3-getlabels---list-gmail-labels)
  - [renewWatch](#4-renewwatch---renew-gmail-subscription)
  - [fetchEmails](#5-fetchemails---fetch-emails)
  - [gmailWebhook](#6-gmailwebhook---pubsub-webhook)
  - [processEmailQueue](#7-processemailqueue---start-email-processing)
  - [getProcessStatus](#8-getprocessstatus---check-job-progress)
  - [unprocessAllEmails](#9-unprocessallemails---reset-emails)
  - [scheduledProcessQueue](#10-scheduledprocessqueue---automatic-processing)
  - [detectDuplicateTransactions](#11-detectduplicatetransactions---detect-internal-movements)
  - [resetInternalMovements](#12-resetinternalmovements---reset-duplicate-flags)
- [Data Flow](#-data-flow)
- [Firestore Collections](#-firestore-collections)
- [Troubleshooting](#-troubleshooting)

---

<details>
<summary><h2>🔑 Authentication</h2></summary>

All admin endpoints require your API token as a query parameter:

```
?token=YOUR_API_TOKEN
```

Your token is configured in `functions/.env` as `API_TOKEN`.

**Example:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/getLabels?token=YOUR_API_TOKEN"
```

</details>

---

<details>
<summary><h2>🚀 Setup Flow</h2></summary>

Follow these steps to set up OneFinance for the first time:

### Step 1: Authorize Gmail

Visit the `authGmail` endpoint to connect your Gmail account.

### Step 2: Find Your Label ID

Use `getLabels` to find the ID of your target label (e.g., "Finance" or "Transactions").

### Step 3: Update Configuration

Set the `TARGET_LABEL` in your `.env` file with your label ID.

### Step 4: Test Processing

Use `fetchEmails` to verify emails are being captured correctly.

### Step 5: Deploy & Monitor

The system will automatically capture new emails and process them.

</details>

---

## 🔌 API Endpoints

### Base URL

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net
```

---

<details>
<summary><h3>1. <code>authGmail</code> - Start OAuth Flow</h3></summary>

**Description:** Initiates the Gmail OAuth authorization flow. Redirects the user to Google's consent screen.

| Property          | Value  |
| ----------------- | ------ |
| **Method**        | `GET`  |
| **Auth Required** | ✅ Yes |
| **Trigger**       | HTTP   |

**URL:**

```
/authGmail?token=YOUR_API_TOKEN
```

**Example:**

```bash
# Open in browser
open "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/authGmail?token=YOUR_API_TOKEN"
```

**Flow:**

1. User visits the endpoint
2. Redirects to Google OAuth consent screen
3. User approves access
4. Redirects to `oauthCallback` with authorization code

**Response:** Redirect to Google OAuth

> ℹ️ **Note:** You only need to authorize once. Tokens are automatically refreshed.

</details>

---

<details>
<summary><h3>2. <code>oauthCallback</code> - OAuth Callback</h3></summary>

**Description:** Handles the OAuth callback from Google after user authorization. Saves tokens and sets up Gmail watch subscription.

| Property          | Value                         |
| ----------------- | ----------------------------- |
| **Method**        | `GET`                         |
| **Auth Required** | ❌ No (Google redirects here) |
| **Trigger**       | HTTP                          |

**URL:**

```
/oauthCallback?code=AUTHORIZATION_CODE
```

**Flow:**

1. Receives authorization code from Google
2. Exchanges code for access/refresh tokens
3. Saves tokens to Firestore (`config/gmail`)
4. Sets up Gmail watch subscription on target label
5. Returns success message

**Success Response:**

```
✅ Authorized successfully!
```

**Error Response (400):**

```
No authorization code
```

**Error Response (500):**

```
Authorization failed: [error message]
```

> ⚠️ **Do not call this endpoint directly.** It's only for Google OAuth redirects.

</details>

---

<details>
<summary><h3>3. <code>getLabels</code> - List Gmail Labels</h3></summary>

**Description:** Lists all Gmail labels for the authenticated account. Use this to find the ID of your target label.

| Property          | Value  |
| ----------------- | ------ |
| **Method**        | `GET`  |
| **Auth Required** | ✅ Yes |
| **Trigger**       | HTTP   |

**URL:**

```
/getLabels?token=YOUR_API_TOKEN
```

**Example:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/getLabels?token=YOUR_API_TOKEN"
```

**Success Response (200):**

```json
{
  "labels": [
    { "id": "INBOX", "name": "INBOX" },
    { "id": "SENT", "name": "SENT" },
    { "id": "Label_123456789", "name": "Finance" },
    { "id": "Label_987654321", "name": "Transactions" }
  ]
}
```

**Error Response (500):**

```json
{
  "error": "Gmail config not found"
}
```

> 💡 **Tip:** Copy the `id` of your desired label and set it as `TARGET_LABEL` in your `.env` file.

</details>

---

<details>
<summary><h3>4. <code>renewWatch</code> - Renew Gmail Subscription</h3></summary>

**Description:** Renews the Gmail watch subscription. Gmail watch subscriptions expire after ~7 days and must be renewed.

| Property          | Value  |
| ----------------- | ------ |
| **Method**        | `GET`  |
| **Auth Required** | ✅ Yes |
| **Trigger**       | HTTP   |

**URL:**

```
/renewWatch?token=YOUR_API_TOKEN
```

**Example:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/renewWatch?token=YOUR_API_TOKEN"
```

**Success Response (200):**

```json
{
  "success": true,
  "expiration": "1737504000000",
  "expirationDate": "2026-01-21T12:00:00.000Z"
}
```

**Error Response (500):**

```json
{
  "success": false,
  "error": "Error message"
}
```

> 💡 **Tip:** Set up a Cloud Scheduler job to call this endpoint weekly to prevent subscription expiration.

</details>

---

<details>
<summary><h3>5. <code>fetchEmails</code> - Fetch Emails</h3></summary>

**Description:** Fetches and stores recent emails from your target label based on a time window. Useful for capturing emails without waiting for new ones.

| Property          | Value  |
| ----------------- | ------ |
| **Method**        | `GET`  |
| **Auth Required** | ✅ Yes |
| **Trigger**       | HTTP   |

**URL:**

```
/fetchEmails?token=YOUR_API_TOKEN
```

**Query Parameters:**

| Parameter | Type   | Default  | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| `token`   | string | required | API authentication token                  |
| `hours`   | number | `24`     | Time window in hours to fetch emails from |

**Examples:**

```bash
# Fetch emails from last 24 hours (default)
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/fetchEmails?token=YOUR_API_TOKEN"

# Fetch emails from last 6 hours
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/fetchEmails?token=YOUR_API_TOKEN&hours=6"

# Fetch emails from last 48 hours
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/fetchEmails?token=YOUR_API_TOKEN&hours=48"
```

**Success Response (200) - With Emails:**

```json
{
  "success": true,
  "processed": 3,
  "emails": [
    {
      "id": "18d5a1b2c3d4e5f6",
      "subject": "Transaction Alert: Purchase at STORE",
      "from": "alerts@bank.com",
      "date": "Tue, 14 Jan 2026 10:30:00 -0500",
      "bodyPreview": "Your transaction of $50.00 at STORE has been..."
    },
    {
      "id": "18d5a1b2c3d4e5f7",
      "subject": "Money Received via Llave",
      "from": "alerts@bank.com",
      "date": "Tue, 14 Jan 2026 09:15:00 -0500",
      "bodyPreview": "You received $100.00 from John Doe..."
    }
  ]
}
```

**Success Response (200) - No Emails:**

```json
{
  "success": true,
  "message": "No emails found in the target label",
  "processed": 0
}
```

**Error Response (500):**

```json
{
  "error": "Error message"
}
```

</details>

---

<details>
<summary><h3>6. <code>gmailWebhook</code> - Pub/Sub Webhook</h3></summary>

**Description:** Receives Gmail Pub/Sub notifications when new emails arrive. This is called automatically by Google Cloud Pub/Sub.

| Property          | Value                                |
| ----------------- | ------------------------------------ |
| **Method**        | `POST`                               |
| **Auth Required** | ❌ No (Google Pub/Sub authenticated) |
| **Trigger**       | HTTP (Pub/Sub push)                  |

**URL:**

```
/gmailWebhook
```

**Request Body (from Pub/Sub):**

```json
{
  "message": {
    "data": "base64-encoded-json",
    "messageId": "1234567890",
    "publishTime": "2026-01-14T10:30:00.000Z"
  }
}
```

**Decoded Data:**

```json
{
  "emailAddress": "user@gmail.com",
  "historyId": "12345"
}
```

**Flow:**

1. Gmail detects new email with target label
2. Sends notification to Pub/Sub topic
3. Pub/Sub pushes to this webhook
4. Function fetches email content via Gmail API
5. Stores email in Firestore `emails` collection
6. Updates `lastHistoryId` for incremental sync

**Success Response (200):**

```
OK
```

**Error Response (400):**

```
No message data
```

**Error Response (500):**

```
Error processing webhook
```

> ⚠️ **Do not call this endpoint directly.** It's only for Pub/Sub push subscriptions.

</details>

---

<details>
<summary><h3>7. <code>processEmailQueue</code> - Start Email Processing</h3></summary>

**Description:** Starts async processing of unprocessed emails from the queue. Returns immediately with a job ID that can be used to track progress via `getProcessStatus`.

| Property          | Value     |
| ----------------- | --------- |
| **Method**        | `GET`     |
| **Auth Required** | ✅ Yes    |
| **Trigger**       | HTTP      |
| **Timeout**       | 9 minutes |
| **Memory**        | 512 MiB   |

**URL:**

```
/processEmailQueue?token=YOUR_API_TOKEN
```

**Query Parameters:**

| Parameter | Type   | Default  | Description                                 |
| --------- | ------ | -------- | ------------------------------------------- |
| `token`   | string | required | API authentication token                    |
| `limit`   | number | `10`     | Maximum emails to process per batch (1-100) |

**Examples:**

```bash
# Start processing default batch (10 emails)
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/processEmailQueue?token=YOUR_API_TOKEN"

# Start processing 50 emails
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/processEmailQueue?token=YOUR_API_TOKEN&limit=50"

# Start processing maximum batch (100 emails)
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/processEmailQueue?token=YOUR_API_TOKEN&limit=100"
```

**Success Response (200):**

```json
{
  "success": true,
  "jobId": "abc12345-1234-5678-9abc-def012345678",
  "message": "Processing started. Use /getProcessStatus?jobId=abc12345-1234-5678-9abc-def012345678 to track progress."
}
```

**Error Response (500):**

```json
{
  "success": false,
  "error": "Error message"
}
```

**Processing Flow (runs in background):**

1. Creates a job document in `process_jobs` collection
2. Queries Firestore for emails with `processed: false`
3. For each email, runs three OpenAI agents in parallel:
   - **Classification Agent:** Determines if transaction should be tracked
   - **Categorization Agent:** Assigns category and subcategory
   - **Time Extraction Agent:** Extracts transaction date/time from email body
4. Stores result in `transactions` collection
5. Marks email as `processed: true`
6. Updates job progress after each email
7. After all emails processed, runs **Internal Movement Detection Agent**:
   - Analyzes all unchecked transactions with `should_track: true`
   - Identifies pairs (same amount, same time, one incoming/one outgoing)
   - Flags matching transactions as `internal_movement: true`
8. Marks job as `completed`

</details>

---

<details>
<summary><h3>8. <code>getProcessStatus</code> - Check Job Progress</h3></summary>

**Description:** Gets the current status and progress of a processing job started by `processEmailQueue`.

| Property          | Value      |
| ----------------- | ---------- |
| **Method**        | `GET`      |
| **Auth Required** | ✅ Yes     |
| **Trigger**       | HTTP       |
| **Timeout**       | 30 seconds |
| **Memory**        | 256 MiB    |

**URL:**

```
/getProcessStatus?token=YOUR_API_TOKEN&jobId=JOB_ID
```

**Query Parameters:**

| Parameter | Type   | Default  | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `token`   | string | required | API authentication token             |
| `jobId`   | string | required | Job ID returned by processEmailQueue |

**Example:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/getProcessStatus?token=YOUR_API_TOKEN&jobId=abc12345-1234-5678-9abc-def012345678"
```

**Success Response (200) - Running:**

```json
{
  "success": true,
  "jobId": "abc12345-1234-5678-9abc-def012345678",
  "status": "running",
  "processed": 5,
  "total": 10,
  "remaining": 5,
  "internalMovementsDetected": 0,
  "currentEmail": "18d5a1b2c3d4e5f6",
  "createdAt": "2026-01-14T10:30:00.000Z",
  "startedAt": "2026-01-14T10:30:01.000Z"
}
```

**Success Response (200) - Completed:**

```json
{
  "success": true,
  "jobId": "abc12345-1234-5678-9abc-def012345678",
  "status": "completed",
  "processed": 10,
  "total": 10,
  "remaining": 0,
  "internalMovementsDetected": 2,
  "createdAt": "2026-01-14T10:30:00.000Z",
  "startedAt": "2026-01-14T10:30:01.000Z",
  "completedAt": "2026-01-14T10:35:00.000Z"
}
```

**Job Status Values:**

| Status      | Description                           |
| ----------- | ------------------------------------- |
| `pending`   | Job created, waiting to start         |
| `running`   | Currently processing emails           |
| `completed` | All emails processed successfully     |
| `failed`    | Processing failed (see `error` field) |

**Error Response (400):**

```json
{
  "success": false,
  "error": "Missing required query parameter: jobId"
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Job abc12345-1234-5678-9abc-def012345678 not found"
}
```

**Transaction Classification Categories:**

- `purchase` - Purchases at merchants
- `incoming` - Money received (via llave, transfer, etc.)
- `outgoing` - Money sent (via llave, transfer, etc.)
- `transfer` - Bank transfers (PSE, ACH)
- `payment` - Bill payments

**Transaction Categories:**

- `food_dining` - Groceries, restaurants, delivery, coffee, bars
- `transportation` - Fuel, public transit, rideshare, parking
- `housing` - Rent, utilities, internet, phone, maintenance
- `shopping` - Clothing, electronics, furniture, personal care
- `entertainment` - Streaming, gaming, movies, hobbies
- `health` - Medical, pharmacy, gym, insurance
- `financial` - Bank fees, loans, credit cards, investments
- `education` - Tuition, courses, learning subscriptions
- `travel` - Flights, hotels, activities
- `income` - Salary, freelance, reimbursements
- `other` - Uncategorized

</details>

---

<details>
<summary><h3>9. <code>unprocessAllEmails</code> - Reset Emails</h3></summary>

**Description:** Marks all processed emails as unprocessed. Useful for testing the queue processor again.

| Property          | Value     |
| ----------------- | --------- |
| **Method**        | `GET`     |
| **Auth Required** | ✅ Yes    |
| **Trigger**       | HTTP      |
| **Timeout**       | 9 minutes |
| **Memory**        | 512 MiB   |

**URL:**

```
/unprocessAllEmails?token=YOUR_API_TOKEN
```

**Example:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/unprocessAllEmails?token=YOUR_API_TOKEN"
```

**Success Response (200):**

```json
{
  "success": true,
  "updated": 25
}
```

**Success Response (200) - No Emails:**

```json
{
  "success": true,
  "updated": 0
}
```

**Error Response (500):**

```json
{
  "error": "Error message"
}
```

> ⚠️ **Warning:** This will cause `processEmailQueue` to reprocess all emails and potentially create duplicate transactions.

</details>

---

<details>
<summary><h3>10. <code>scheduledProcessQueue</code> - Automatic Processing</h3></summary>

**Description:** Automatically processes up to 100 unprocessed emails. Runs on a schedule.

| Property          | Value            |
| ----------------- | ---------------- |
| **Method**        | N/A              |
| **Auth Required** | N/A              |
| **Trigger**       | Cloud Scheduler  |
| **Schedule**      | Every 12 hours   |
| **Timezone**      | America/New_York |
| **Timeout**       | 9 minutes        |
| **Memory**        | 512 MiB          |

**Schedule:** `0 */12 * * *` (every 12 hours)

This function:

1. Runs automatically twice daily
2. Processes up to 100 emails per run
3. Handles timeouts gracefully
4. Continues where it left off on next run

> 📝 **Note:** This endpoint cannot be called manually. It's triggered by Cloud Scheduler.

</details>

---

<details>
<summary><h3>11. <code>detectDuplicateTransactions</code> - Detect Internal Movements</h3></summary>

**Description:** Analyzes transactions for a specific day to detect internal movements (transfers between your own accounts). Uses AI to identify matching outgoing/incoming transaction pairs.

| Property          | Value           |
| ----------------- | --------------- |
| **Method**        | `GET` or `POST` |
| **Auth Required** | ✅ Yes          |
| **Trigger**       | HTTP            |
| **Timeout**       | 5 minutes       |
| **Memory**        | 512 MiB         |

**URL:**

```
/detectDuplicateTransactions?token=YOUR_API_TOKEN&date=YYYY-MM-DD
```

**Parameters:**

| Parameter | Type   | Required | Description                      |
| --------- | ------ | -------- | -------------------------------- |
| `date`    | string | ✅ Yes   | Target date in YYYY-MM-DD format |

**Example Request:**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/detectDuplicateTransactions?token=YOUR_API_TOKEN&date=2026-01-19"
```

**Success Response:**

```json
{
  "success": true,
  "message": "Analyzed 15 transactions for 2026-01-19. Found 2 internal movements.",
  "date": "2026-01-19",
  "transactionsAnalyzed": 15,
  "internalMovementsDetected": 2,
  "pairs": [
    {
      "outgoingId": "abc123",
      "incomingId": "def456",
      "amount": 500000,
      "datetime": "2026-01-19T10:30:00",
      "reason": "Matching transfer from Account A to Account B"
    }
  ]
}
```

**Error Response (Missing Date):**

```json
{
  "success": false,
  "error": "MISSING_DATE",
  "message": "Date parameter is required. Use ?date=YYYY-MM-DD or provide date in request body."
}
```

> 📝 **Note:** This endpoint updates transactions in Firestore, setting `internal_movement: true` for detected pairs.

</details>

---

<details>
<summary><h3>12. <code>resetInternalMovements</code> - Reset Duplicate Flags</h3></summary>

**Description:** Resets the internal movement flags on transactions, allowing them to be re-analyzed. Can target a specific day or all transactions.

| Property          | Value           |
| ----------------- | --------------- |
| **Method**        | `GET` or `POST` |
| **Auth Required** | ✅ Yes          |
| **Trigger**       | HTTP            |
| **Timeout**       | 5 minutes       |
| **Memory**        | 512 MiB         |

**URL:**

```
/resetInternalMovements?token=YOUR_API_TOKEN&date=YYYY-MM-DD
```

**Parameters:**

| Parameter | Type   | Required | Description                                               |
| --------- | ------ | -------- | --------------------------------------------------------- |
| `date`    | string | ❌ No    | Target date in YYYY-MM-DD format. If omitted, resets all. |

**Example Request (Specific Date):**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/resetInternalMovements?token=YOUR_API_TOKEN&date=2026-01-19"
```

**Example Request (All Transactions):**

```bash
curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/resetInternalMovements?token=YOUR_API_TOKEN"
```

**Success Response:**

```json
{
  "success": true,
  "message": "Reset 10 transactions to unchecked state",
  "updated": 10,
  "date": "2026-01-19"
}
```

> 📝 **Note:** After resetting, you can run `detectDuplicateTransactions` again to re-analyze the transactions.

</details>

---

<details>
<summary><h2>🔄 Data Flow</h2></summary>

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Gmail Inbox   │────▶│  Pub/Sub    │────▶│  gmailWebhook   │
│  (with label)   │     │   Topic     │     │   (function)    │
└─────────────────┘     └─────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │   Firestore     │
                                            │    emails/      │
                                            │ (processed:false)│
                                            └────────┬────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        │
        ▼
┌───────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ processEmailQueue │────▶│  OpenAI Agents  │────▶│   Firestore     │
│  (or scheduled)   │     │ Classification  │     │  transactions/  │
│                   │     │ Categorization  │     │                 │
└───────────────────┘     └─────────────────┘     └─────────────────┘
```

</details>

---

<details>
<summary><h2>🗄️ Firestore Collections</h2></summary>

### `config/gmail`

Stores OAuth tokens and processing state.

```javascript
{
  tokens: {
    access_token: "ya29.a0AfH6...",
    refresh_token: "1//0g...",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    token_type: "Bearer",
    expiry_date: 1737000000000
  },
  lastHistoryId: "12345"  // Tracks last processed history ID
}
```

### `emails/{messageId}`

Stores captured emails.

```javascript
{
  subject: "Transaction Alert: Purchase at STORE",
  from: "alerts@bank.com",
  date: "Tue, 14 Jan 2026 10:30:00 -0500",
  body: "Full email body text with transaction details...",
  receivedAt: Timestamp,
  processed: false  // true after processEmailQueue runs
}
```

### `transactions/{transactionId}`

Stores processed transactions with AI classification.

```javascript
{
  emailId: "18d5a1b2c3d4e5f6",
  emailSubject: "Transaction Alert: Purchase at STORE",
  classification: {
    should_track: true,
    transaction: {
      type: "purchase",
      amount: 50000,
      description: "STORE NAME",
      date: "2026-01-14",
      method: "card"
    },
    exclusion_reason: null
  },
  categorization: {
    category: "shopping",
    subcategory: "clothing_accessories",
    confidence: "high",
    notes: null
  },
  timeExtraction: {
    transaction_datetime: "2026-01-14T10:30:00-05:00",
    transaction_date: "2026-01-14",
    transaction_time: "10:30:00",
    extraction_successful: true,
    notes: null
  },
  internal_movement: false,
  internal_movement_checked: true,
  createdAt: Timestamp
}
```

**Field Descriptions:**

| Field                                 | Description                                              |
| ------------------------------------- | -------------------------------------------------------- |
| `timeExtraction.transaction_datetime` | ISO 8601 datetime with Colombia timezone (-05:00)        |
| `internal_movement`                   | `true` if this is a transfer between user's own accounts |
| `internal_movement_checked`           | `true` after internal movement detection has run         |

### `process_jobs/{jobId}`

Stores processing job status and progress.

```javascript
{
  status: "completed",        // "pending" | "running" | "completed" | "failed"
  limit: 10,                  // Maximum emails to process
  processed: 10,              // Number of emails processed so far
  total: 10,                  // Total emails found to process
  remaining: 0,               // Emails still unprocessed
  internalMovementsDetected: 2,
  currentEmail: null,         // ID of email currently being processed (when running)
  error: null,                // Error message (if failed)
  createdAt: Timestamp,
  startedAt: Timestamp,
  completedAt: Timestamp
}
```

</details>

---

<details>
<summary><h2>🛠️ Endpoints Summary</h2></summary>

| Endpoint                      | Method    | Auth | Description                         |
| ----------------------------- | --------- | ---- | ----------------------------------- |
| `authGmail`                   | GET       | ✅   | Start Gmail OAuth flow              |
| `oauthCallback`               | GET       | ❌   | OAuth callback (Google redirects)   |
| `getLabels`                   | GET       | ✅   | List all Gmail labels               |
| `renewWatch`                  | GET       | ✅   | Renew Gmail watch subscription      |
| `fetchEmails`                 | GET       | ✅   | Fetch & store recent emails         |
| `gmailWebhook`                | POST      | ❌   | Pub/Sub webhook (Google calls)      |
| `processEmailQueue`           | GET       | ✅   | Start async email processing        |
| `getProcessStatus`            | GET       | ✅   | Check job progress                  |
| `unprocessAllEmails`          | GET       | ✅   | Reset all emails to unprocessed     |
| `scheduledProcessQueue`       | Scheduler | N/A  | Auto-runs every 12 hours            |
| `detectDuplicateTransactions` | GET/POST  | ✅   | Detect internal movements for a day |
| `resetInternalMovements`      | GET/POST  | ✅   | Reset duplicate detection flags     |

</details>

---

<details>
<summary><h2>📋 View Logs</h2></summary>

Monitor function execution:

```bash
cd functions
npm run logs

# Or directly with Firebase CLI
firebase functions:log

# Follow logs in real-time
firebase functions:log --follow

# Filter by function name
firebase functions:log --only processEmailQueue
```

</details>

---

<details>
<summary><h2>❓ Troubleshooting</h2></summary>

### "Gmail config not found"

**Cause:** OAuth tokens are not saved in Firestore.

**Solution:** Run the authorization flow:

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/authGmail?token=YOUR_API_TOKEN
```

### "No refresh token available"

**Cause:** The refresh token was not saved during authorization.

**Solution:**

1. Revoke app access at [Google Account Settings](https://myaccount.google.com/permissions)
2. Re-authorize with `authGmail?token=...`

### Emails not being captured

**Possible causes and solutions:**

1. **Watch subscription expired**
   - Call `renewWatch?token=...` to renew

2. **Wrong label ID**
   - Use `getLabels?token=...` to verify the correct ID
   - Update `TARGET_LABEL` in `.env`

3. **Pub/Sub misconfiguration**
   - Verify Pub/Sub subscription points to `gmailWebhook`
   - Check Pub/Sub subscription in Google Cloud Console

### 401 Unauthorized

**Cause:** Invalid or missing API token.

**Solution:** Verify your `API_TOKEN` matches what's in `functions/.env`

### Queue processing timeout

**Cause:** Too many emails to process in one batch.

**Solution:**

- Use smaller `limit` values (e.g., `?limit=10`)
- The function will gracefully stop before timeout
- Run multiple times to process all emails

### Duplicate transactions

**Cause:** Emails were reprocessed after using `unprocessAllEmails`, or internal movements (transfers between your own accounts) appear as separate transactions.

**Solution:**

1. Use `detectDuplicateTransactions` endpoint to identify and flag internal movements:

   ```bash
   curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/detectDuplicateTransactions?token=YOUR_API_TOKEN&date=2026-01-19"
   ```

2. If you need to re-analyze, first reset the flags:

   ```bash
   curl "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/resetInternalMovements?token=YOUR_API_TOKEN&date=2026-01-19"
   ```

3. To prevent duplicates when reprocessing emails, clear the `transactions` collection before using `unprocessAllEmails`.

</details>

---

<details>
<summary><h2>🔧 Environment Variables</h2></summary>

Required environment variables in `functions/.env`:

```bash
# Gmail OAuth
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/oauthCallback

# Gmail Configuration
TARGET_LABEL=Label_123456789
PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications

# API Security
API_TOKEN=your-secure-random-token

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
```

</details>
