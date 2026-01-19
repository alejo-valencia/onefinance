import { useState, useEffect, useCallback } from "react";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  getDate,
} from "date-fns";
import { useApi } from "../hooks/useApi";

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
    let start: Date;
    let end: Date;

    if (viewMode === "day") {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    } else if (viewMode === "week") {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
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
    if (viewMode === "day") setCurrentDate(subDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, HH:mm");
  };

  const formatPeriodLabel = () => {
    if (viewMode === "day") {
      return format(currentDate, "MMMM d, yyyy");
    } else if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      const startDay = getDate(weekStart);
      const endDay = getDate(weekEnd);
      const monthName = format(weekStart, "MMMM");
      const year = format(weekStart, "yyyy");
      return `${monthName} ${startDay} - ${endDay}, ${year}`;
    } else {
      return format(currentDate, "MMMM yyyy");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-white/5 p-6 rounded-lg mb-8 w-full">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <h3 className="text-xl font-bold text-white">Transactions</h3>

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
        </div>

        <div className="flex items-center justify-center gap-2 text-white">
          <button
            onClick={handlePrev}
            className="px-3 py-2 text-sm font-medium hover:bg-white/10 rounded-lg transition-colors"
          >
            Prev
          </button>
          <span className="font-medium w-56 text-center capitalize">
            {formatPeriodLabel()}
          </span>
          <button
            onClick={handleNext}
            className="px-3 py-2 text-sm font-medium hover:bg-white/10 rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            No transactions found for this period
          </div>
        ) : (
          <table className="w-full text-left text-sm text-gray-300">
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
        )}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <TransactionList />
    </div>
  );
}

export default Dashboard;
