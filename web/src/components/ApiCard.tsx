import { ReactNode, useState } from "react";

type ButtonVariant = "primary" | "warning" | "danger";

interface ApiCardProps {
  icon: string;
  title: string;
  description: string;
  buttonText: string;
  buttonVariant?: ButtonVariant;
  onSubmit: () => Promise<unknown>;
  children?: ReactNode;
  highlight?: boolean;
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 shadow-green-500/25",
  warning:
    "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:from-orange-700 active:to-orange-800 shadow-orange-500/25",
  danger:
    "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 shadow-red-500/25",
};

function ApiCard({
  icon,
  title,
  description,
  buttonText,
  buttonVariant = "primary",
  onSubmit,
  children,
  highlight = false,
}: ApiCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: "success" | "error";
    data: unknown;
  } | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const data = await onSubmit();
      setResult({ status: "success", data });
    } catch (error) {
      setResult({
        status: "error",
        data: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const cardClasses = highlight
    ? "border-green-500/40 bg-green-500/8 ring-1 ring-green-500/20"
    : "border-white/10 hover:border-white/20";

  return (
    <article
      className={`flex flex-col h-full bg-white/5 backdrop-blur-sm rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/25 ${cardClasses}`}
    >
      <div className="p-4 sm:p-5 lg:p-6 flex-1">
        {/* Card Header */}
        <header className="mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
            <span role="img" aria-hidden="true" className="text-lg sm:text-xl">
              {icon}
            </span>
            {title}
          </h3>
        </header>

        {/* Description */}
        <p className="text-gray-400 text-xs sm:text-sm leading-relaxed mb-4">
          {description}
        </p>

        {/* Optional form fields */}
        {children && <div className="space-y-3 sm:space-y-4">{children}</div>}

        {/* Result display */}
        {result && (
          <div
            className={`mt-4 p-3 rounded-lg font-mono text-xs sm:text-sm overflow-x-auto max-h-48 overflow-y-auto ${
              result.status === "success"
                ? "bg-green-500/15 border border-green-500/50 text-green-300"
                : "bg-red-500/15 border border-red-500/50 text-red-300"
            }`}
            role="status"
            aria-live="polite"
          >
            <pre className="whitespace-pre-wrap break-words">
              <span
                role="img"
                aria-label={result.status === "success" ? "Success" : "Error"}
              >
                {result.status === "success" ? "✅ " : "❌ "}
              </span>
              {typeof result.data === "string"
                ? result.data
                : JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Button always at bottom */}
      <footer className="p-4 sm:p-5 lg:p-6 pt-0">
        <button
          onClick={handleSubmit}
          disabled={loading}
          aria-busy={loading}
          className={`w-full py-2.5 sm:py-3 px-4 text-white text-sm sm:text-base font-semibold rounded-lg transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${buttonStyles[buttonVariant]}`}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            buttonText
          )}
        </button>
      </footer>
    </article>
  );
}

export default ApiCard;
