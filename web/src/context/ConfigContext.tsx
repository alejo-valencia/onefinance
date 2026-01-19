import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export interface AppConfig {
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  authorizedEmail: string;
  functionsBaseUrl: string;
}

interface ConfigContextType {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        // In production, we use environment variables injected at build time
        // For development, you can set these in a .env file
        const cfg: AppConfig = {
          firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
          firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
          firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
          authorizedEmail: import.meta.env.VITE_AUTHORIZED_EMAIL || "",
          functionsBaseUrl: import.meta.env.VITE_FUNCTIONS_BASE_URL || "",
        };

        // Validate required config
        if (
          !cfg.firebaseApiKey ||
          !cfg.firebaseAuthDomain ||
          !cfg.firebaseProjectId
        ) {
          throw new Error(
            "Firebase configuration is incomplete. Check your environment variables."
          );
        }

        if (!cfg.authorizedEmail) {
          console.warn("VITE_AUTHORIZED_EMAIL is not set");
        }

        if (!cfg.functionsBaseUrl) {
          console.warn("VITE_FUNCTIONS_BASE_URL is not set");
        }

        setConfig(cfg);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load configuration"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  return (
    <ConfigContext.Provider value={{ config, loading, error }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
