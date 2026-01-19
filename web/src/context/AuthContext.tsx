import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User,
  Auth,
} from "firebase/auth";
import { useConfig } from "./ConfigContext";

interface AuthContextType {
  user: User | null;
  isAuthorized: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { config, loading: configLoading } = useConfig();
  const [auth, setAuth] = useState<Auth | null>(null);
  const [provider, setProvider] = useState<GoogleAuthProvider | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Firebase when config is ready
  useEffect(() => {
    if (!config || configLoading) return;

    const app = initializeApp({
      apiKey: config.firebaseApiKey,
      authDomain: config.firebaseAuthDomain,
      projectId: config.firebaseProjectId,
    });

    const authInstance = getAuth(app);
    const googleProvider = new GoogleAuthProvider();

    setAuth(authInstance);
    setProvider(googleProvider);

    // Set up auth state listener
    const unsubscribe = onAuthStateChanged(authInstance, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [config, configLoading]);

  const isAuthorized = user?.email === config?.authorizedEmail;

  const signIn = useCallback(async () => {
    if (!auth || !provider) {
      throw new Error("Firebase not initialized");
    }
    await signInWithPopup(auth, provider);
  }, [auth, provider]);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, [auth]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth?.currentUser) return null;
    return await auth.currentUser.getIdToken(true);
  }, [auth]);

  // Handle unauthorized users - sign them out after a delay
  useEffect(() => {
    if (user && !isAuthorized) {
      const timer = setTimeout(() => {
        signOutUser();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [user, isAuthorized, signOutUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthorized,
        loading: loading || configLoading,
        signIn,
        signOutUser,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
