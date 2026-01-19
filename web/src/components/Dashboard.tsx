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

const CATEGORIES: Record<string, string[]> = {
  food_dining: [
    "groceries",
    "restaurants",
    "delivery",
    "coffee_bakery",
    "bars_alcohol",
  ],
  transportation: [
    "fuel",
    "public_transit",
    "rideshare",
    "parking_tolls",
    "vehicle_maintenance",
  ],
  housing: [
    "rent_mortgage",
    "utilities_electric",
    "utilities_water",
    "utilities_gas",
    "internet_tv",
    "phone_plan",
    "home_maintenance",
  ],
  shopping: [
    "clothing_accessories",
    "electronics",
    "home_furniture",
    "personal_care",
    "pets",
    "gifts",
  ],
  entertainment: [
    "streaming",
    "gaming",
    "movies_events",
    "books_magazines",
    "hobbies",
  ],
  health: [
    "medical_appointments",
    "pharmacy_medications",
    "gym_fitness",
    "insurance_health",
  ],
  financial: [
    "bank_fees",
    "loan_payment",
    "credit_card_payment",
    "insurance_other",
    "investments",
    "taxes",
  ],
  education: ["tuition_courses", "books_supplies", "subscriptions_learning"],
  travel: ["flights", "hotels_lodging", "travel_activities"],
  income: [
    "salary",
    "freelance",
    "reimbursement",
    "gift_received",
    "investment_return",
  ],
  other: ["uncategorized"],
};

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

  const updateTransaction = async (
    transactionId: string,
    updates: { category?: string; subcategory?: string },
  ) => {
    try {
      await callApi("/updateTransaction", "POST", {
        transactionId,
        ...updates,
      });
      // Update local state
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === transactionId
            ? {
                ...t,
                categorization: {
                  category:
                    updates.category ?? t.categorization?.category ?? "",
                  subcategory:
                    updates.subcategory ?? t.categorization?.subcategory ?? "",
                },
              }
            : t,
        ),
      );
    } catch (error) {
      console.error("Failed to update transaction", error);
    }
  };

  const handleCategoryChange = (transactionId: string, category: string) => {
    const subcategories = CATEGORIES[category] || [];
    const subcategory = subcategories[0] || "";
    updateTransaction(transactionId, { category, subcategory });
  };

  const handleSubcategoryChange = (
    transactionId: string,
    subcategory: string,
  ) => {
    updateTransaction(transactionId, { subcategory });
  };

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

  const cleanDescription = (description: string) => {
    const patternsToRemove = [
      /compra en establecimiento\s*/gi,
      /purchase at\s*/gi,
      /descuento en\s*/gi,
      /lugar de transacción:\s*/gi,
      /internet en\s*/gi,
      /internet,\s*/gi,
      /internet\s*/gi,
      /compra en\s*/gi,
      /\ben\b\s*/gi,
      /,\s*/g,
    ];
    let cleaned = description;
    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, "");
    }
    return cleaned.trim();
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
                <th className="px-4 py-3">Subcategory</th>
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
                const currentCategory = t.categorization?.category || "";
                const currentSubcategory = t.categorization?.subcategory || "";

                return (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(t.timeExtraction?.transaction_datetime) ||
                        "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {t.internal_movement && (
                          <span className="text-xs text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                            Internal
                          </span>
                        )}
                        <span className="font-medium text-white max-w-xs truncate">
                          {cleanDescription(tx?.description || "Unknown")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.internal_movement ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <select
                          value={currentCategory}
                          onChange={(e) =>
                            handleCategoryChange(t.id, e.target.value)
                          }
                          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs capitalize cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="" className="bg-gray-800">
                            Select category
                          </option>
                          {Object.keys(CATEGORIES).map((cat) => (
                            <option
                              key={cat}
                              value={cat}
                              className="bg-gray-800 capitalize"
                            >
                              {cat.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.internal_movement ? (
                        <span className="text-gray-500">-</span>
                      ) : currentCategory && CATEGORIES[currentCategory] ? (
                        <select
                          value={currentSubcategory}
                          onChange={(e) =>
                            handleSubcategoryChange(t.id, e.target.value)
                          }
                          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs capitalize cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {CATEGORIES[currentCategory].map((sub) => (
                            <option
                              key={sub}
                              value={sub}
                              className="bg-gray-800 capitalize"
                            >
                              {sub.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
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
