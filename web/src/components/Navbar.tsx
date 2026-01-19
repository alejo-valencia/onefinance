import { useAuth } from "../context/AuthContext";

function Navbar() {
  const { user, isAuthorized, signIn, signOutUser } = useAuth();

  return (
    <nav className="bg-white/5 border-b border-white/10 sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Title */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">📧</span>
            <div>
              <h1 className="text-white font-bold text-lg">OneFinance</h1>
              <p className="text-gray-400 text-xs">Gmail Integration</p>
            </div>
          </div>

          {/* User Section */}
          <div className="flex items-center gap-4">
            {user && isAuthorized ? (
              <>
                <div className="hidden sm:flex items-center gap-3">
                  <img
                    className="w-8 h-8 rounded-full border-2 border-green-500"
                    src={
                      user.photoURL || "https://www.gravatar.com/avatar/?d=mp"
                    }
                    alt="User"
                  />
                  <div className="text-right">
                    <div className="text-white text-sm font-medium">
                      {user.displayName || "User"}
                    </div>
                    <div className="text-green-500 text-xs">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={signOutUser}
                  className="px-4 py-2 text-sm font-medium text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={signIn}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-5 h-5"
                />
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
