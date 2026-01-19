function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-3 border-white/10 border-t-green-500 rounded-full animate-spin mb-5"></div>
      <p className="text-gray-300 text-lg">Loading OneFinance Dashboard...</p>
    </div>
  );
}

export default LoadingScreen;
