/**
 * OneFinance Dashboard - Secure Web UI for managing Gmail integration
 * Uses Firebase Authentication with Google Sign-In
 */

require("dotenv").config();

const express = require("express");
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

// Middleware to serve static files
app.use(express.static("public"));

/**
 * CSS Styles
 */
function getStyles() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      text-align: center;
      margin-bottom: 30px;
    }
    
    h1 {
      font-size: 2.5rem;
      color: #fff;
      margin-bottom: 10px;
    }
    
    .subtitle {
      color: #888;
      font-size: 1.1rem;
    }
    
    .auth-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
    }
    
    .auth-section.hidden {
      display: none;
    }
    
    .user-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .user-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 2px solid #4CAF50;
    }
    
    .user-email {
      color: #4CAF50;
      font-weight: 600;
    }
    
    .endpoints-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
    }
    
    .endpoint-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .endpoint-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    }
    
    .endpoint-card h2 {
      font-size: 1.3rem;
      margin-bottom: 10px;
      color: #fff;
    }
    
    .endpoint-card p {
      color: #aaa;
      margin-bottom: 15px;
      font-size: 0.95rem;
    }
    
    .auth-card {
      border-color: #4CAF50;
      background: rgba(76, 175, 80, 0.1);
    }
    
    .info-card {
      border-color: #2196F3;
      background: rgba(33, 150, 243, 0.1);
    }
    
    .form-group {
      margin-bottom: 15px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.9rem;
      color: #bbb;
    }
    
    .form-group input {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 1rem;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #4CAF50;
    }
    
    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
      text-align: center;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
    }
    
    .btn-primary:hover {
      background: linear-gradient(135deg, #45a049, #3d8b40);
      transform: translateY(-1px);
    }
    
    .btn-google {
      background: #fff;
      color: #333;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 0 auto;
      padding: 14px 30px;
    }
    
    .btn-google:hover {
      background: #f5f5f5;
    }
    
    .btn-google img {
      width: 20px;
      height: 20px;
    }
    
    .btn-warning {
      background: linear-gradient(135deg, #ff9800, #f57c00);
      color: white;
    }
    
    .btn-warning:hover {
      background: linear-gradient(135deg, #f57c00, #e65100);
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #f44336, #d32f2f);
      color: white;
    }
    
    .btn-danger:hover {
      background: linear-gradient(135deg, #d32f2f, #c62828);
    }
    
    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .result {
      margin-top: 15px;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.9rem;
      overflow-x: auto;
    }
    
    .result.hidden {
      display: none;
    }
    
    .result.loading {
      background: rgba(33, 150, 243, 0.2);
      border: 1px solid #2196F3;
    }
    
    .result.success {
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid #4CAF50;
    }
    
    .result.error {
      background: rgba(244, 67, 54, 0.2);
      border: 1px solid #f44336;
    }
    
    .result pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .info-box {
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
    }
    
    .info-box code {
      color: #4CAF50;
      word-break: break-all;
    }
    
    .dashboard-content.hidden {
      display: none;
    }
    
    .login-prompt {
      text-align: center;
      padding: 60px 20px;
    }
    
    .login-prompt h2 {
      margin-bottom: 20px;
      color: #fff;
    }
    
    .login-prompt p {
      color: #888;
      margin-bottom: 30px;
    }
    
    .unauthorized-message {
      background: rgba(244, 67, 54, 0.2);
      border: 1px solid #f44336;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
    
    .unauthorized-message.hidden {
      display: none;
    }
    
    footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      color: #666;
    }
    
    footer a {
      color: #4CAF50;
    }
    
    @media (max-width: 768px) {
      .endpoints-grid {
        grid-template-columns: 1fr;
      }
      
      h1 {
        font-size: 1.8rem;
      }
    }
  `;
}

/**
 * Main dashboard with Firebase Authentication
 */
app.get("/", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OneFinance Dashboard</title>
      <style>
        ${getStyles()}
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>📧 OneFinance Dashboard</h1>
          <p class="subtitle">Gmail Integration Control Panel</p>
        </header>
        
        <!-- Authentication Section -->
        <div id="authSection" class="auth-section">
          <div id="loginPrompt" class="login-prompt">
            <h2>🔐 Sign in to continue</h2>
            <p>Only authorized users can access this dashboard.</p>
            <button id="googleSignIn" class="btn btn-google">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google">
              Sign in with Google
            </button>
            <div id="unauthorizedMessage" class="unauthorized-message hidden">
              <strong>⚠️ Unauthorized Account</strong>
              <p>Your email is not authorized to access this dashboard. Please sign in with an authorized account.</p>
            </div>
          </div>
          
          <div id="userSection" class="hidden">
            <div class="user-info">
              <img id="userAvatar" class="user-avatar" src="" alt="User">
              <div>
                <div id="userName" style="color: #fff; font-weight: 600;"></div>
                <div id="userEmail" class="user-email"></div>
              </div>
            </div>
            <button id="signOutBtn" class="btn btn-secondary">Sign Out</button>
          </div>
        </div>
        
        <!-- Dashboard Content (hidden until authenticated) -->
        <div id="dashboardContent" class="dashboard-content hidden">
          <div class="endpoints-grid">
            
            <!-- Gmail OAuth -->
            <section class="endpoint-card auth-card">
              <h2>🔐 Gmail OAuth</h2>
              <p>Authenticate with Gmail to enable email processing.</p>
              <button id="gmailAuthBtn" class="btn btn-primary" style="width: 100%;">Authenticate with Gmail</button>
              <div id="gmailAuthResult" class="result hidden"></div>
            </section>
            
            <!-- Renew Watch -->
            <section class="endpoint-card">
              <h2>🔄 Renew Watch</h2>
              <p>Renew the Gmail watch subscription to continue receiving notifications.</p>
              <form class="endpoint-form" data-endpoint="/renewWatch" data-method="GET">
                <button type="submit" class="btn btn-primary">Renew Watch Subscription</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Get Labels -->
            <section class="endpoint-card">
              <h2>🏷️ Get Labels</h2>
              <p>List all Gmail labels for the authenticated user.</p>
              <form class="endpoint-form" data-endpoint="/getLabels" data-method="GET">
                <button type="submit" class="btn btn-primary">Fetch Labels</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Test Process Emails -->
            <section class="endpoint-card">
              <h2>📨 Test Process Emails</h2>
              <p>Test processing recent emails (for development/testing).</p>
              <form class="endpoint-form" data-endpoint="/testProcessEmails" data-method="GET">
                <button type="submit" class="btn btn-warning">Run Test Processing</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Process Email Queue -->
            <section class="endpoint-card">
              <h2>📥 Process Email Queue</h2>
              <p>Start async processing of unprocessed emails in the queue.</p>
              <form class="endpoint-form" data-endpoint="/processEmailQueue" data-method="POST">
                <div class="form-group">
                  <label for="limit">Batch Limit (optional)</label>
                  <input type="number" name="limit" id="limit" placeholder="10" min="1" max="100">
                </div>
                <button type="submit" class="btn btn-primary">Start Queue Processing</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Get Process Status -->
            <section class="endpoint-card">
              <h2>📊 Get Process Status</h2>
              <p>Check the status of a processing job.</p>
              <form class="endpoint-form" data-endpoint="/getProcessStatus" data-method="GET">
                <div class="form-group">
                  <label for="jobId">Job ID</label>
                  <input type="text" name="jobId" id="jobId" placeholder="Enter job ID" required>
                </div>
                <button type="submit" class="btn btn-primary">Check Status</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Unprocess All Emails -->
            <section class="endpoint-card">
              <h2>🔄 Unprocess All Emails</h2>
              <p>Reset all emails to unprocessed state (for testing).</p>
              <form class="endpoint-form" data-endpoint="/unprocessAllEmails" data-method="POST">
                <button type="submit" class="btn btn-danger">Reset All Emails</button>
              </form>
              <div class="result hidden"></div>
            </section>
            
            <!-- Gmail Webhook (info only) -->
            <section class="endpoint-card info-card">
              <h2>📡 Gmail Webhook</h2>
              <p>This endpoint receives push notifications from Gmail. It's automatically triggered by Google's Pub/Sub.</p>
              <div class="info-box">
                <strong>Endpoint:</strong> <code>${FUNCTIONS_BASE_URL}/gmailWebhook</code>
              </div>
            </section>
            
          </div>
        </div>
        
        <footer>
          <p>OneFinance Gmail Integration • Secured with Firebase Authentication</p>
        </footer>
      </div>
      
      <!-- Firebase SDK -->
      <script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
        import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
        
        // Firebase configuration (public - safe to expose)
        const firebaseConfig = {
          apiKey: '${FIREBASE_API_KEY}',
          authDomain: '${FIREBASE_AUTH_DOMAIN}',
          projectId: '${FIREBASE_PROJECT_ID}'
        };
        
        // Initialize Firebase
        const firebaseApp = initializeApp(firebaseConfig);
        const auth = getAuth(firebaseApp);
        const provider = new GoogleAuthProvider();
        
        // Configuration
        const AUTHORIZED_EMAIL = '${AUTHORIZED_EMAIL}';
        const FUNCTIONS_BASE_URL = '${FUNCTIONS_BASE_URL}';
        
        // DOM Elements
        const loginPrompt = document.getElementById('loginPrompt');
        const userSection = document.getElementById('userSection');
        const dashboardContent = document.getElementById('dashboardContent');
        const unauthorizedMessage = document.getElementById('unauthorizedMessage');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        
        // Current user's ID token (for API calls)
        let currentIdToken = null;
        
        /**
         * Get fresh ID token for API calls
         */
        async function getIdToken() {
          const user = auth.currentUser;
          if (!user) return null;
          return await user.getIdToken(true);
        }
        
        /**
         * Check if user email is authorized
         */
        function isAuthorized(email) {
          return email === AUTHORIZED_EMAIL;
        }
        
        /**
         * Update UI based on auth state
         */
        function updateUI(user, authorized) {
          if (user && authorized) {
            loginPrompt.classList.add('hidden');
            userSection.classList.remove('hidden');
            dashboardContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            
            userAvatar.src = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
            userName.textContent = user.displayName || 'User';
            userEmail.textContent = user.email;
          } else if (user && !authorized) {
            loginPrompt.classList.remove('hidden');
            userSection.classList.add('hidden');
            dashboardContent.classList.add('hidden');
            unauthorizedMessage.classList.remove('hidden');
            
            // Sign out unauthorized user after showing message
            setTimeout(() => signOut(auth), 3000);
          } else {
            loginPrompt.classList.remove('hidden');
            userSection.classList.add('hidden');
            dashboardContent.classList.add('hidden');
            unauthorizedMessage.classList.add('hidden');
          }
        }
        
        // Auth state listener
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            const authorized = isAuthorized(user.email);
            if (authorized) {
              currentIdToken = await getIdToken();
            }
            updateUI(user, authorized);
          } else {
            currentIdToken = null;
            updateUI(null, false);
          }
        });
        
        // Google Sign-In button
        document.getElementById('googleSignIn').addEventListener('click', async () => {
          try {
            await signInWithPopup(auth, provider);
          } catch (error) {
            console.error('Sign-in error:', error);
            alert('Sign-in failed: ' + error.message);
          }
        });
        
        // Sign Out button
        document.getElementById('signOutBtn').addEventListener('click', async () => {
          try {
            await signOut(auth);
          } catch (error) {
            console.error('Sign-out error:', error);
          }
        });
        
        // Gmail OAuth button
        document.getElementById('gmailAuthBtn').addEventListener('click', async () => {
          const resultDiv = document.getElementById('gmailAuthResult');
          try {
            const token = await getIdToken();
            if (!token) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '❌ Not authenticated';
              return;
            }
            
            resultDiv.className = 'result success';
            resultDiv.innerHTML = '✅ Opening Gmail authentication...';
            
            // Open Gmail auth with Firebase ID token in Authorization header via fetch first
            // Then redirect based on response
            const authUrl = FUNCTIONS_BASE_URL + '/authGmail';
            
            const response = await fetch(authUrl, {
              method: 'GET',
              headers: {
                'Authorization': 'Bearer ' + token
              }
            });
            
            const data = await response.json();
            
            if (data.authUrl) {
              window.open(data.authUrl, '_blank');
            } else {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '❌ Failed to get auth URL: ' + JSON.stringify(data);
            }
          } catch (error) {
            resultDiv.className = 'result error';
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        });
        
        // Endpoint forms handler
        document.querySelectorAll('.endpoint-form').forEach(form => {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const endpoint = form.dataset.endpoint;
            const method = form.dataset.method || 'GET';
            const resultDiv = form.nextElementSibling;
            const submitBtn = form.querySelector('button[type="submit"]');
            
            // Get fresh token
            const token = await getIdToken();
            if (!token) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '❌ Not authenticated. Please sign in again.';
              return;
            }
            
            // Disable button during request
            submitBtn.disabled = true;
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '⏳ Loading...';
            
            // Collect form data
            const formData = new FormData(form);
            
            // Build request
            let url = FUNCTIONS_BASE_URL + endpoint;
            let fetchOptions = { 
              method,
              headers: {
                'Authorization': 'Bearer ' + token
              }
            };
            
            if (method === 'GET') {
              const params = new URLSearchParams();
              formData.forEach((value, key) => {
                if (value) params.append(key, value);
              });
              if (params.toString()) {
                url += '?' + params.toString();
              }
            } else {
              const bodyData = {};
              formData.forEach((value, key) => {
                if (value) bodyData[key] = value;
              });
              fetchOptions.headers['Content-Type'] = 'application/json';
              fetchOptions.body = JSON.stringify(bodyData);
            }
            
            resultDiv.className = 'result loading';
            resultDiv.innerHTML = '⏳ Loading...';
            
            try {
              const response = await fetch(url, fetchOptions);
              const data = await response.json();
              
              if (response.ok) {
                resultDiv.className = 'result success';
                resultDiv.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
              } else {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = '<pre>Error: ' + JSON.stringify(data, null, 2) + '</pre>';
              }
            } catch (error) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '❌ Request failed: ' + error.message;
            } finally {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalText;
            }
          });
        });
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// Legacy auth page - redirect to main page
app.get("/auth", (req, res) => {
  res.redirect("/");
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 OneFinance Dashboard running at http://localhost:${PORT}`);
  console.log(`📧 Functions Base URL: ${FUNCTIONS_BASE_URL}`);
  console.log(`🔐 Authorized Email: ${AUTHORIZED_EMAIL}`);
});
