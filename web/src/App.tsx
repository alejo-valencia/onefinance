import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useConfig } from "./context/ConfigContext";
import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import Admin from "./components/Admin";
import LoadingScreen from "./components/LoadingScreen";
import ErrorScreen from "./components/ErrorScreen";
import LoginScreen from "./components/LoginScreen";

function App() {
  const { loading: configLoading, error: configError } = useConfig();
  const { user, isAuthorized, loading: authLoading } = useAuth();

  if (configError) {
    return <ErrorScreen message={configError} />;
  }

  if (configLoading || authLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col">
        {user && isAuthorized ? (
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        ) : (
          <LoginScreen />
        )}
      </main>
      <footer className="text-center py-6 px-4 text-gray-500 text-sm border-t border-white/5">
        <p>OneFinance Gmail Integration</p>
        <p className="text-xs text-gray-600 mt-1">
          Secured with Firebase Authentication
        </p>
      </footer>
    </div>
  );
}

export default App;
