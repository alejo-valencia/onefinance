interface ErrorScreenProps {
  message: string;
}

function ErrorScreen({ message }: ErrorScreenProps) {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-lg w-full">
        {/* Error Icon */}
        <div
          className="text-5xl sm:text-6xl mb-4"
          role="img"
          aria-label="Warning"
        >
          ⚠️
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-red-400 mb-3">
          Failed to load application
        </h2>

        <p className="text-gray-300 text-sm sm:text-base mb-2">
          Please refresh the page or contact support.
        </p>

        {/* Error message box */}
        <div className="font-mono text-xs sm:text-sm bg-red-500/15 border border-red-500/30 px-4 sm:px-5 py-3 sm:py-4 rounded-xl my-5 text-red-300 break-words">
          {message}
        </div>

        <button
          onClick={handleRefresh}
          className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 transition-all shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}

export default ErrorScreen;
