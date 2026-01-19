import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { useApi } from "../hooks/useApi";
import ApiCard from "./ApiCard";
import InputField from "./InputField";

interface Transaction {
  id: string;
  classification?: {
    transaction?: {
      description: string;
      amount: number;
      method: string;
      type: string;
    };
  };
  categorization?: {
    category: string;
    subcategory: string;
  };
  timeExtraction?: {
    transaction_datetime: string;
  };
  internal_movement?: boolean;
}

type ViewMode = "day" | "week" | "month";

function TransactionList() {
  const { callApi } = useApi();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDateRange = useCallback(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (viewMode === "week") {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
      start.setDate(diff);

      // Reset end to start then add 6 days to ensure correct month crossing
      end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
      end.setDate(start.getDate() + 6);
    } else if (viewMode === "month") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [viewMode, currentDate]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const data = await callApi("/getTransactions", "GET", undefined, {
        startDate,
        endDate,
        limit: "1000",
      });
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error("Failed to fetch transactions", error);
    } finally {
      setLoading(false);
    }
  }, [callApi, getDateRange]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "day") newDate.setDate(newDate.getDate() - 1);
    if (viewMode === "week") newDate.setDate(newDate.getDate() - 7);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "day") newDate.setDate(newDate.getDate() + 1);
    if (viewMode === "week") newDate.setDate(newDate.getDate() + 7);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("es-CO", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-white/5 p-6 rounded-lg mb-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h3 className="text-xl font-bold text-white">Transactions</h3>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/10 rounded-lg p-1">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-md text-sm capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-white">
            <button
              onClick={handlePrev}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              ←
            </button>
            <span className="font-medium min-w-[150px] text-center">
              {currentDate.toLocaleDateString("es-CO", {
                month: "long",
                year: "numeric",
                ...(viewMode === "day" ? { day: "numeric" } : {}),
              })}
            </span>
            <button
              onClick={handleNext}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          No transactions found for this period
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-gray-300">
            <thead className="bg-white/5 uppercase font-medium text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transactions.map((t) => {
                const tx = t.classification?.transaction;
                const isExpense =
                  tx?.type === "purchase" ||
                  tx?.type === "outgoing" ||
                  tx?.type === "payment" ||
                  tx?.type === "transfer";

                return (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(t.timeExtraction?.transaction_datetime) ||
                        "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white max-w-xs truncate">
                        {tx?.description || "Unknown"}
                      </div>
                      {t.internal_movement && (
                        <span className="text-xs text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded ml-2">
                          Internal
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="capitalize text-white">
                        {t.categorization?.category?.replace("_", " ") || "-"}
                      </div>
                      <div className="text-xs opacity-60">
                        {t.categorization?.subcategory?.replace("_", " ") || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {tx?.method || "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        isExpense ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {isExpense ? "-" : "+"} {formatCurrency(tx?.amount || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <TransactionList />

      {/* Section Header */}
      <div className="mb-6 sm:mb-8 border-t border-white/10 pt-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
          API Controls
        </h2>
        <p className="text-gray-400 text-sm">
          Manage your Gmail integration and email processing
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
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
