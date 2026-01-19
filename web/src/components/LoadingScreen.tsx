function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      role="status"
      aria-label="Loading application"
    >
      {/* Spinner */}
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-transparent border-t-green-500 rounded-full animate-spin"></div>
      </div>

      {/* Loading text */}
      <p className="text-gray-300 text-base sm:text-lg text-center">
        Loading OneFinance Dashboard...
      </p>
      <p className="text-gray-500 text-xs sm:text-sm mt-2">
        Please wait while we set things up
      </p>
    </div>
  );
}

export default LoadingScreen;
