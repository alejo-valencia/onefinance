import { useAuth } from "../context/AuthContext";

function LoginScreen() {
  const { user, isAuthorized, signIn } = useAuth();

  const showUnauthorized = user && !isAuthorized;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🔐</div>
        <h2 className="text-2xl font-bold text-white mb-4">
          Sign in to continue
        </h2>
        <p className="text-gray-400 mb-8">
          Only authorized users can access this dashboard.
        </p>

        <button
          onClick={signIn}
          className="inline-flex items-center gap-3 px-6 py-3 bg-white text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          Sign in with Google
        </button>

        {showUnauthorized && (
          <div className="mt-8 bg-red-500/20 border border-red-500 rounded-lg p-4 text-left">
            <strong className="text-red-400">⚠️ Unauthorized Account</strong>
            <p className="text-gray-300 mt-2 text-sm">
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
