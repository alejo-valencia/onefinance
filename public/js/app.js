/**
 * OneFinance Dashboard - Client-side JavaScript
 * Handles Firebase Authentication and API interactions
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// Application state
let auth = null;
let provider = null;
let currentIdToken = null;
let config = null;

/**
 * Fetch configuration from the server
 */
async function fetchConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("Failed to fetch configuration");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching config:", error);
    throw error;
  }
}

/**
 * Initialize Firebase with the fetched configuration
 */
function initializeFirebase(firebaseConfig) {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();
}

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
  return email === config.authorizedEmail;
}

/**
 * Update UI based on auth state
 */
function updateUI(user, authorized) {
  const loginPrompt = document.getElementById("loginPrompt");
  const userSection = document.getElementById("userSection");
  const dashboardContent = document.getElementById("dashboardContent");
  const unauthorizedMessage = document.getElementById("unauthorizedMessage");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  if (user && authorized) {
    loginPrompt.classList.add("hidden");
    userSection.classList.remove("hidden");
    dashboardContent.classList.remove("hidden");
    unauthorizedMessage.classList.add("hidden");

    userAvatar.src = user.photoURL || "https://www.gravatar.com/avatar/?d=mp";
    userName.textContent = user.displayName || "User";
    userEmail.textContent = user.email;
  } else if (user && !authorized) {
    loginPrompt.classList.remove("hidden");
    userSection.classList.add("hidden");
    dashboardContent.classList.add("hidden");
    unauthorizedMessage.classList.remove("hidden");

    // Sign out unauthorized user after showing message
    setTimeout(() => signOut(auth), 3000);
  } else {
    loginPrompt.classList.remove("hidden");
    userSection.classList.add("hidden");
    dashboardContent.classList.add("hidden");
    unauthorizedMessage.classList.add("hidden");
  }
}

/**
 * Set up auth state listener
 */
function setupAuthListener() {
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
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Google Sign-In button
  document
    .getElementById("googleSignIn")
    .addEventListener("click", async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error("Sign-in error:", error);
        alert("Sign-in failed: " + error.message);
      }
    });

  // Sign Out button
  document.getElementById("signOutBtn").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  });

  // Gmail OAuth button
  document
    .getElementById("gmailAuthBtn")
    .addEventListener("click", async () => {
      const resultDiv = document.getElementById("gmailAuthResult");
      resultDiv.classList.remove("hidden");

      try {
        const token = await getIdToken();
        if (!token) {
          resultDiv.className = "result error";
          resultDiv.innerHTML = "❌ Not authenticated";
          return;
        }

        resultDiv.className = "result success";
        resultDiv.innerHTML = "✅ Opening Gmail authentication...";

        const authUrl = config.functionsBaseUrl + "/authGmail";

        const response = await fetch(authUrl, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token,
          },
        });

        const data = await response.json();

        if (data.authUrl) {
          window.open(data.authUrl, "_blank");
        } else {
          resultDiv.className = "result error";
          resultDiv.innerHTML =
            "❌ Failed to get auth URL: " + JSON.stringify(data);
        }
      } catch (error) {
        resultDiv.className = "result error";
        resultDiv.innerHTML = "❌ Error: " + error.message;
      }
    });

  // Endpoint forms handler
  document.querySelectorAll(".endpoint-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const endpoint = form.dataset.endpoint;
      const method = form.dataset.method || "GET";
      const resultDiv = form.nextElementSibling;
      const submitBtn = form.querySelector('button[type="submit"]');

      // Get fresh token
      const token = await getIdToken();
      if (!token) {
        resultDiv.classList.remove("hidden");
        resultDiv.className = "result error";
        resultDiv.innerHTML = "❌ Not authenticated. Please sign in again.";
        return;
      }

      // Disable button during request
      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = "⏳ Loading...";

      // Collect form data
      const formData = new FormData(form);

      // Build request
      let url = config.functionsBaseUrl + endpoint;
      let fetchOptions = {
        method,
        headers: {
          Authorization: "Bearer " + token,
        },
      };

      if (method === "GET") {
        const params = new URLSearchParams();
        formData.forEach((value, key) => {
          if (value) params.append(key, value);
        });
        if (params.toString()) {
          url += "?" + params.toString();
        }
      } else {
        const bodyData = {};
        formData.forEach((value, key) => {
          if (value) bodyData[key] = value;
        });
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(bodyData);
      }

      resultDiv.classList.remove("hidden");
      resultDiv.className = "result loading";
      resultDiv.innerHTML = "⏳ Loading...";

      try {
        const response = await fetch(url, fetchOptions);
        const data = await response.json();

        if (response.ok) {
          resultDiv.className = "result success";
          resultDiv.innerHTML =
            "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
        } else {
          resultDiv.className = "result error";
          resultDiv.innerHTML =
            "<pre>Error: " + JSON.stringify(data, null, 2) + "</pre>";
        }
      } catch (error) {
        resultDiv.className = "result error";
        resultDiv.innerHTML = "❌ Request failed: " + error.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  });
}

/**
 * Main initialization
 */
async function init() {
  try {
    // Fetch configuration from server
    config = await fetchConfig();

    // Initialize Firebase
    initializeFirebase({
      apiKey: config.firebaseApiKey,
      authDomain: config.firebaseAuthDomain,
      projectId: config.firebaseProjectId,
    });

    // Set up auth listener
    setupAuthListener();

    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    console.error("Failed to initialize app:", error);
    document.body.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f44336;">
        <h2>⚠️ Failed to load application</h2>
        <p>Please refresh the page or contact support.</p>
        <p style="font-family: monospace; font-size: 0.9rem;">${error.message}</p>
      </div>
    `;
  }
}

// Start the app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
