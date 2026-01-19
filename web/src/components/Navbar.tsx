import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Navbar() {
  const { user, isAuthorized, signIn, signOutUser } = useAuth();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive ? "text-green-500" : "text-gray-300 hover:text-white"
    }`;

  return (
    <header>
      <nav
        className="bg-white/5 border-b border-white/10 sticky top-0 z-50 backdrop-blur-md"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo/Title */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span
                className="text-xl sm:text-2xl"
                role="img"
                aria-label="Email"
              >
                📧
              </span>
              <div>
                <h1 className="text-white font-bold text-base sm:text-lg leading-tight">
                  OneFinance
                </h1>
                <p className="text-gray-400 text-[10px] sm:text-xs hidden xs:block">
                  Gmail Integration
                </p>
              </div>
            </div>

            {/* Navigation Links */}
            {user && isAuthorized && (
              <div className="hidden md:flex items-center gap-6">
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
                <NavLink to="/dashboard" className={navLinkClass}>
                  Dashboard
                </NavLink>
              </div>
            )}

            {/* User Section */}
            <div className="flex items-center gap-2 sm:gap-4">
              {user && isAuthorized ? (
                <>
                  <div className="hidden sm:flex items-center gap-3">
                    <img
                      className="w-8 h-8 rounded-full border-2 border-green-500 ring-2 ring-green-500/20"
                      src={
                        user.photoURL || "https://www.gravatar.com/avatar/?d=mp"
                      }
                      alt={`${user.displayName || "User"}'s profile`}
                      loading="lazy"
                    />
                    <div className="text-right">
                      <div className="text-white text-sm font-medium truncate max-w-[150px]">
                        {user.displayName || "User"}
                      </div>
                      <div className="text-green-500 text-xs truncate max-w-[150px]">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={signOutUser}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 active:bg-white/25 transition-colors focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label="Sign out of your account"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={signIn}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white text-gray-800 font-medium text-sm rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                  aria-label="Sign in with Google"
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt=""
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    aria-hidden="true"
                  />
                  <span className="hidden xs:inline">Sign in</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
