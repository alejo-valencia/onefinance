# 💰 OneFinance - Gmail Integration

Automatically capture and store emails from specific Gmail labels using Firebase Cloud Functions.

📖 **[Usage Guide](USAGE.md)** - Step-by-step instructions for authentication and API usage

## 📁 Project Structure

```
functions/
├── src/
│   ├── index.ts                 # 🚀 Main entry point - exports all functions
│   ├── config/
│   │   └── constants.ts         # ⚙️ Configuration (labels, topics, OAuth)
│   ├── handlers/
│   │   ├── auth.ts              # 🔐 OAuth flow (authGmail, oauthCallback)
│   │   ├── webhook.ts           # 📬 Gmail webhook handler
│   │   ├── queue.ts             # 📤 Email queue processor & internal movement detection
│   │   └── admin.ts             # 🛠️ Utility endpoints
│   ├── services/
│   │   ├── gmail.ts             # 📧 Gmail API client & helpers
│   │   ├── email.ts             # 💾 Email storage operations
│   │   ├── emailProcessor.ts    # 🔄 Shared email processing logic
│   │   └── openai.ts            # 🤖 OpenAI agents (classification, categorization, time, internal)
│   ├── types/
│   │   └── index.ts             # 📝 TypeScript type definitions
│   └── utils/
│       └── index.ts             # 🛠️ Shared utilities (auth, error handling)
└── lib/                         # 📦 Compiled JavaScript (gitignored)
```

## ☁️ Cloud Functions (v2)

All functions use **Firebase Cloud Functions 2nd generation** for improved performance, longer timeouts, and better scaling.

| Function                | Trigger   | Description                                             |
| ----------------------- | --------- | ------------------------------------------------------- |
| `authGmail`             | HTTP      | 🔐 Initiates Gmail OAuth flow                           |
| `oauthCallback`         | HTTP      | 🔑 Handles OAuth callback, saves tokens, sets up watch  |
| `gmailWebhook`          | HTTP      | 📬 Receives Pub/Sub notifications, stores emails        |
| `renewWatch`            | HTTP      | 🔄 Renews Gmail watch subscription (call before expiry) |
| `getLabels`             | HTTP      | 🏷️ Lists all Gmail labels with IDs                      |
| `testProcessEmails`     | HTTP      | 🧪 Test endpoint - processes recent emails              |
| `processEmailQueue`     | HTTP      | 📤 Start async email processing (returns job ID)        |
| `getProcessStatus`      | HTTP      | 📊 Get status of a processing job                       |
| `unprocessAllEmails`    | HTTP      | 🔁 Reset all emails to unprocessed (testing)            |
| `scheduledProcessQueue` | Scheduler | ⏰ Auto-process queue every 12 hours                    |

## 🗄️ Firestore Collections

### `config/gmail`

Stores OAuth tokens and processing state.

```js
{
  tokens: { access_token, refresh_token, ... },
  lastHistoryId: "12345"  // Tracks processed emails
}
```

### `emails/{messageId}`

Stores captured emails.

```js
{
  subject: "Transaction Alert",
  from: "alerts@bank.com",
  date: "Mon, 13 Jan 2026 10:30:00 -0500",
  body: "Your transaction of $50.00...",
  receivedAt: Timestamp
}
```

## 🚀 Setup

### 1. Prerequisites

- Firebase project with Firestore enabled
- Google Cloud Pub/Sub topic created
- Gmail API enabled in Google Cloud Console

### 2. Install Dependencies

```bash
cd functions
npm install
```

### 3. Configure Environment Variables

```bash
cd functions
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Gmail OAuth (from Google Cloud Console)
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=https://us-central1-YOUR-PROJECT.cloudfunctions.net/oauthCallback

# Gmail Configuration
TARGET_LABEL=Label_xxxxxxxxxx
PUBSUB_TOPIC=projects/YOUR-PROJECT/topics/gmail-notifications

# API Authentication (generate a secure random token)
API_TOKEN=your-secure-random-token
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Authorize Gmail

Visit the `authGmail` endpoint to connect your Gmail account:

```
https://us-central1-YOUR-PROJECT.cloudfunctions.net/authGmail?token=YOUR_API_TOKEN
```

### 5. Configure Pub/Sub

Set up a push subscription to your `gmailWebhook` endpoint:

```
https://us-central1-YOUR-PROJECT.cloudfunctions.net/gmailWebhook
```

## 🧪 Testing

Process recent emails without waiting for new ones:

```bash
# Process last 3 emails (default)
curl "https://us-central1-YOUR-PROJECT.cloudfunctions.net/testProcessEmails?token=YOUR_API_TOKEN"

# Process last 10 emails
curl "https://us-central1-YOUR-PROJECT.cloudfunctions.net/testProcessEmails?token=YOUR_API_TOKEN&count=10"
```

## 🔄 Maintenance

### Renew Watch Subscription

Gmail watch expires after ~7 days. Renew it manually or set up a scheduled function:

```bash
curl "https://us-central1-YOUR-PROJECT.cloudfunctions.net/renewWatch?token=YOUR_API_TOKEN"
```

### View Logs

```bash
npm run logs
# or
firebase functions:log
```

## ⚙️ Configuration

All configuration is done via environment variables in `functions/.env`:

| Variable              | Description                               |
| --------------------- | ----------------------------------------- |
| `GMAIL_CLIENT_ID`     | OAuth client ID from Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | OAuth client secret                       |
| `GMAIL_REDIRECT_URI`  | OAuth callback URL                        |
| `TARGET_LABEL`        | Gmail label ID to monitor                 |
| `PUBSUB_TOPIC`        | Google Cloud Pub/Sub topic name           |
| `API_TOKEN`           | Secret token for authenticating API calls |

### 🏷️ Finding Your Label ID

```bash
curl "https://us-central1-YOUR-PROJECT.cloudfunctions.net/getLabels?token=YOUR_API_TOKEN"
```

## 📡 How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gmail     │────▶│  Pub/Sub    │────▶│  Webhook    │────▶│  Firestore  │
│  (new mail) │     │  (notify)   │     │  (process)  │     │  (store)    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. 📧 New email arrives in Gmail with target label
2. 📡 Gmail sends notification to Pub/Sub topic
3. 🔔 Pub/Sub pushes to `gmailWebhook` function
4. 📥 Function fetches full email content via Gmail API
5. 💾 Email subject and body stored in Firestore

## 📜 Scripts

```bash
npm run serve   # 🧪 Run locally with emulators
npm run deploy  # 🚀 Deploy to Firebase
npm run logs    # 📋 View function logs
```

## 🔒 Security

- ✅ All sensitive credentials stored in `functions/.env` (gitignored)
- 🔐 Admin endpoints require `?token=API_TOKEN` query parameter
- 🔄 OAuth tokens are automatically refreshed before expiration
- 📬 Webhook endpoint (`gmailWebhook`) is open for Pub/Sub (authenticated by Google)

📄 Copy `functions/.env.example` to get started with your own credentials

---

## 🛠️ Project Configuration Guide

Before deploying this project, you need to replace the placeholder values with your own configuration.

### Step 1: Set Your Firebase Project ID

1. **`.firebaserc`** - Update with your Firebase project ID:
   ```json
   {
     "projects": {
       "default": "YOUR_PROJECT_ID"
     }
   }
   ```

### Step 2: Configure Cloud Functions Environment

1. Copy the example file:

   ```bash
   cp functions/.env.example functions/.env
   ```

2. **`functions/.env`** - Fill in all values:

   ```bash
   # Gmail OAuth (from Google Cloud Console)
   GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your-client-secret
   GMAIL_REDIRECT_URI=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/oauthCallback

   # Gmail Configuration
   TARGET_LABEL=Label_xxxxxxxxxx
   PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications

   # API Security (generate a secure random token)
   API_TOKEN=your-secure-random-token

   # OpenAI
   OPENAI_API_KEY=sk-your-openai-api-key
   ```

### Step 3: Configure Dashboard (Optional)

The web dashboard at `index.js` provides a UI for managing endpoints.

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. **`.env`** (root) - Fill in your values:

   ```bash
   PORT=3000
   FUNCTIONS_BASE_URL=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net
   AUTHORIZED_EMAIL=your-email@gmail.com
   ```

3. Run the dashboard:
   ```bash
   npm start
   ```

### What to Replace

| Placeholder                | Description               | Where to Get It                                                           |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `YOUR_PROJECT_ID`          | Your Firebase project ID  | [Firebase Console](https://console.firebase.google.com)                   |
| `your-client-id`           | OAuth 2.0 Client ID       | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `your-client-secret`       | OAuth 2.0 Client Secret   | Same as above                                                             |
| `Label_xxxxxxxxxx`         | Gmail label ID to monitor | Run `getLabels` endpoint after setup                                      |
| `your-secure-random-token` | API authentication token  | Generate with `openssl rand -hex 32`                                      |
| `sk-your-openai-api-key`   | OpenAI API key            | [OpenAI Platform](https://platform.openai.com/api-keys)                   |
| `your-email@gmail.com`     | Email for dashboard auth  | Your Gmail address                                                        |

---

Made with 💚 for personal finance tracking
