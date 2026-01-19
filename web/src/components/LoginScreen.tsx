import { useAuth } from "../context/AuthContext";

function LoginScreen() {
  const { user, isAuthorized, signIn } = useAuth();

  const showUnauthorized = user && !isAuthorized;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="text-center max-w-md w-full">
        {/* Icon with subtle animation */}
        <div
          className="text-5xl sm:text-6xl mb-4 sm:mb-6 animate-pulse"
          role="img"
          aria-label="Lock"
        >
          🔐
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">
          Sign in to continue
        </h2>
        <p className="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8 leading-relaxed">
          Only authorized users can access this dashboard.
        </p>

        <button
          onClick={signIn}
          className="inline-flex items-center justify-center gap-3 w-full sm:w-auto px-6 py-3.5 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          aria-label="Sign in with Google"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt=""
            className="w-5 h-5"
            aria-hidden="true"
          />
          Sign in with Google
        </button>

        {showUnauthorized && (
          <div
            className="mt-6 sm:mt-8 bg-red-500/15 border border-red-500/50 rounded-xl p-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300"
            role="alert"
          >
            <strong className="text-red-400 flex items-center gap-2">
              <span role="img" aria-label="Warning">
                ⚠️
              </span>
              Unauthorized Account
            </strong>
            <p className="text-gray-300 mt-2 text-sm leading-relaxed">
              Your email is not authorized to access this dashboard. Please sign
              in with an authorized account.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
