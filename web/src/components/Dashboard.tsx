import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { useApi } from "../hooks/useApi";
import ApiCard from "./ApiCard";
import InputField from "./InputField";

function Dashboard() {
  const { getIdToken } = useAuth();
  const { config } = useConfig();
  const { callApi } = useApi();

  // Form state
  const [hours, setHours] = useState("");
  const [jobId, setJobId] = useState("");

  const handleGmailAuth = async () => {
    const token = await getIdToken();
    if (!token) throw new Error("Not authenticated");

    const authUrl = config!.functionsBaseUrl + "/authGmail";
    const response = await fetch(authUrl, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await response.json();

    if (data.authUrl) {
      window.open(data.authUrl, "_blank");
      return "Opening Gmail authentication...";
    }
    throw new Error("Failed to get auth URL");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ApiCard
          icon="🔐"
          title="Gmail OAuth"
          description="Authenticate with Gmail to enable email processing."
          buttonText="Authenticate with Gmail"
          onSubmit={handleGmailAuth}
          highlight
        />

        <ApiCard
          icon="🔄"
          title="Renew Watch"
          description="Renew the Gmail watch subscription to continue receiving notifications."
          buttonText="Renew Watch Subscription"
          onSubmit={() => callApi("/renewWatch", "GET")}
        />

        <ApiCard
          icon="🏷️"
          title="Get Labels"
          description="List all Gmail labels for the authenticated user."
          buttonText="Fetch Labels"
          onSubmit={() => callApi("/getLabels", "GET")}
        />

        <ApiCard
          icon="📨"
          title="Fetch Emails"
          description="Fetch and store recent emails from your target label."
          buttonText="Fetch Emails"
          buttonVariant="warning"
          onSubmit={() =>
            callApi(
              "/fetchEmails",
              "GET",
              undefined,
              hours ? { hours } : undefined
            )
          }
        >
          <InputField
            label="Time Window in Hours (optional, default: 24)"
            id="hours"
            type="number"
            placeholder="24"
            value={hours}
            onChange={setHours}
            min={1}
          />
        </ApiCard>

        <ApiCard
          icon="📥"
          title="Process Email Queue"
          description="Start async processing of all unprocessed emails in the queue."
          buttonText="Start Queue Processing"
          onSubmit={() => callApi("/processEmailQueue", "POST")}
        />

        <ApiCard
          icon="📊"
          title="Get Process Status"
          description="Check the status of the latest or a specific processing job."
          buttonText="Check Status"
          onSubmit={() =>
            callApi(
              "/getProcessStatus",
              "GET",
              undefined,
              jobId ? { jobId } : undefined
            )
          }
        >
          <InputField
            label="Job ID (optional - defaults to latest)"
            id="jobId"
            type="text"
            placeholder="Leave empty for latest job"
            value={jobId}
            onChange={setJobId}
          />
        </ApiCard>

        <ApiCard
          icon="🔄"
          title="Unprocess All Emails"
          description="Reset all emails to unprocessed state (for testing)."
          buttonText="Reset All Emails"
          buttonVariant="danger"
          onSubmit={() => callApi("/unprocessAllEmails", "POST")}
        />
      </div>
    </div>
  );
}

export default Dashboard;
