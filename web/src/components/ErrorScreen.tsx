interface ErrorScreenProps {
  message: string;
}

function ErrorScreen({ message }: ErrorScreenProps) {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold text-red-400 mb-4">
        ⚠️ Failed to load application
      </h2>
      <p className="text-gray-300 mb-2">
        Please refresh the page or contact support.
      </p>
      <p className="font-mono text-sm bg-red-500/20 px-5 py-4 rounded-lg my-5 max-w-xl">
        {message}
      </p>
      <button
        onClick={handleRefresh}
        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-lg hover:from-green-600 hover:to-green-700 transition-all"
      >
        Refresh Page
      </button>
    </div>
  );
}

export default ErrorScreen;
