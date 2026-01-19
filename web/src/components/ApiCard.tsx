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
    "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700",
  warning:
    "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
  danger:
    "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700",
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

  return (
    <div
      className={`flex flex-col h-full bg-white/5 rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${
        highlight ? "border-green-500/50 bg-green-500/10" : "border-white/10"
      }`}
    >
      <div className="p-6 flex-1">
        <h2 className="text-lg font-semibold text-white mb-2">
          {icon} {title}
        </h2>
        <p className="text-gray-400 text-sm mb-4">{description}</p>

        {/* Optional form fields */}
        {children && <div className="space-y-4">{children}</div>}

        {/* Result display */}
        {result && (
          <div
            className={`mt-4 p-3 rounded-lg font-mono text-sm overflow-x-auto ${
              result.status === "success"
                ? "bg-green-500/20 border border-green-500"
                : "bg-red-500/20 border border-red-500"
            }`}
          >
            <pre className="whitespace-pre-wrap break-words">
              {result.status === "success" ? "✅ " : "❌ "}
              {typeof result.data === "string"
                ? result.data
                : JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Button always at bottom */}
      <div className="p-6 pt-0">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-3 px-4 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${buttonStyles[buttonVariant]}`}
        >
          {loading ? "⏳ Loading..." : buttonText}
        </button>
      </div>
    </div>
  );
}

export default ApiCard;
