/**
 * OneFinance Dashboard - Web UI for managing Gmail integration endpoints
 */

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// The only authorized email for authentication (set via environment variable)
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || "";

// Base URL for Firebase Functions (set via environment variable)
const FUNCTIONS_BASE_URL = process.env.FUNCTIONS_BASE_URL || "";

// API Token for authenticating with Firebase Functions
const API_TOKEN = process.env.API_TOKEN || "";

// Validate required environment variables
if (!AUTHORIZED_EMAIL) {
  console.warn("⚠️  AUTHORIZED_EMAIL environment variable is not set!");
}
if (!FUNCTIONS_BASE_URL) {
  console.warn("⚠️  FUNCTIONS_BASE_URL environment variable is not set!");
}
if (!API_TOKEN) {
  console.warn("⚠️  API_TOKEN environment variable is not set!");
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
    
    .token-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      border: 1px solid rgba(255, 255, 255, 0.1);
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
    
    .btn-auth {
      background: linear-gradient(135deg, #2196F3, #1976D2);
      color: white;
      width: 100%;
    }
    
    .btn-auth:hover {
      background: linear-gradient(135deg, #1976D2, #1565C0);
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
    
    .back-link {
      display: inline-block;
      margin-top: 20px;
      color: #4CAF50;
      text-decoration: none;
    }
    
    .back-link:hover {
      text-decoration: underline;
    }
    
    .description {
      color: #aaa;
      margin-bottom: 20px;
    }
    
    .form-card {
      background: rgba(0, 0, 0, 0.2);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
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
 * Authentication page - No token required, only authorized email
 */
app.get("/auth", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OneFinance - Gmail Authentication</title>
      <style>
        ${getStyles()}
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Gmail Authentication</h1>
        <p class="description">Enter your email to authenticate with Gmail. Only authorized users can proceed.</p>
        
        <form id="authForm" class="form-card">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input type="email" id="email" name="email" placeholder="your-email@gmail.com" required>
          </div>
          <div class="form-group" ${API_TOKEN ? 'style="display:none"' : ""}>
            <label for="apiToken">API Token (for Firebase Functions)</label>
            <input type="password" id="apiToken" name="apiToken" placeholder="Enter your API token" value="${API_TOKEN}">
          </div>
          <button type="submit" class="btn btn-primary">🚀 Authenticate with Gmail</button>
        </form>
        
        <div id="result" class="result hidden"></div>
        
        <a href="/" class="back-link">← Back to Dashboard</a>
      </div>
      
      <script>
        const AUTHORIZED_EMAIL = '${AUTHORIZED_EMAIL}';
        const FUNCTIONS_BASE_URL = '${FUNCTIONS_BASE_URL}';
        
        document.getElementById('authForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('email').value;
          const token = document.getElementById('apiToken').value;
          const resultDiv = document.getElementById('result');
          
          if (email !== AUTHORIZED_EMAIL) {
            resultDiv.className = 'result error';
            resultDiv.innerHTML = '❌ Unauthorized. Only ' + AUTHORIZED_EMAIL + ' can authenticate.';
            return;
          }
          
          resultDiv.className = 'result success';
          resultDiv.innerHTML = '✅ Authorized! Opening Gmail authentication in a new window...';
          
          // Open Gmail auth in new window
          setTimeout(() => {
            const authUrl = FUNCTIONS_BASE_URL + '/authGmail' + (token ? '?token=' + encodeURIComponent(token) : '');
            window.open(authUrl, '_blank');
          }, 1000);
        });
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

/**
 * Main dashboard
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
        
        <!-- Global API Token -->
        <div class="token-section" ${API_TOKEN ? 'style="display:none"' : ""}>
          <div class="form-group">
            <label for="apiToken">🔑 API Token (required for most endpoints)</label>
            <input type="password" id="apiToken" placeholder="Enter your API token" value="${API_TOKEN}" />
          </div>
        </div>
        <input type="hidden" id="apiTokenHidden" value="${API_TOKEN}" />
        
        <div class="endpoints-grid">
          
          <!-- Authentication Section -->
          <section class="endpoint-card auth-card">
            <h2>🔐 Authentication</h2>
            <p>Authenticate with Gmail OAuth. Opens in a new window.</p>
            <a href="/auth" target="_blank" class="btn btn-auth">Open Authentication Page</a>
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
        
        <footer>
          <p>OneFinance Gmail Integration • <a href="${FUNCTIONS_BASE_URL}" target="_blank">Functions URL</a></p>
        </footer>
      </div>
      
      <script>
        const FUNCTIONS_BASE_URL = '${FUNCTIONS_BASE_URL}';
        
        document.querySelectorAll('.endpoint-form').forEach(form => {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const endpoint = form.dataset.endpoint;
            const method = form.dataset.method || 'GET';
            const resultDiv = form.nextElementSibling;
            const token = document.getElementById('apiTokenHidden').value || document.getElementById('apiToken').value;
            const submitBtn = form.querySelector('button[type="submit"]');
            
            if (!token) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '❌ Please enter your API token first';
              return;
            }
            
            // Disable button during request
            submitBtn.disabled = true;
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '⏳ Loading...';
            
            // Collect form data
            const formData = new FormData(form);
            const params = new URLSearchParams();
            params.append('token', token);
            
            // Build URL with query params for GET, or body for POST
            let url = FUNCTIONS_BASE_URL + endpoint;
            let fetchOptions = { method };
            
            if (method === 'GET') {
              formData.forEach((value, key) => {
                if (value) params.append(key, value);
              });
              url += '?' + params.toString();
            } else {
              url += '?token=' + encodeURIComponent(token);
              const bodyData = {};
              formData.forEach((value, key) => {
                if (value) bodyData[key] = value;
              });
              fetchOptions.headers = { 'Content-Type': 'application/json' };
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

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 OneFinance Dashboard running at http://localhost:${PORT}`);
  console.log(`📧 Functions Base URL: ${FUNCTIONS_BASE_URL}`);
});
