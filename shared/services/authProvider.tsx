import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getIdToken,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebaseClient";
import type { AuthContextValue, AuthSession, SignInInput } from "../types/authProvider";

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

const AUTH_SESSION_INITIAL_STATE: AuthSession = {
  status: "loading",
  user: null,
  idToken: null,
  lastTokenRefreshAt: null,
  error: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Authentication request failed.";
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession>(AUTH_SESSION_INITIAL_STATE);
  const authRef = useRef<ReturnType<typeof getFirebaseAuth> | null>(null);

  const syncUserSession = useCallback(async (user: AuthSession["user"], status: AuthSession["status"]) => {
    if (!user) {
      setSession({
        status,
        user: null,
        idToken: null,
        lastTokenRefreshAt: null,
        error: null,
      });
      return;
    }

    try {
      const token = await getIdToken(user, false);
      setSession({
        status,
        user,
        idToken: token,
        lastTokenRefreshAt: Date.now(),
        error: null,
      });
    } catch (error) {
      setSession({
        status: "unauthenticated",
        user: null,
        idToken: null,
        lastTokenRefreshAt: null,
        error: normalizeErrorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      const auth = getFirebaseAuth();
      authRef.current = auth;

      setPersistence(auth, browserLocalPersistence).catch(() => {
        // Ignore persistence failures and keep default behavior.
      });

      unsubscribe = onAuthStateChanged(auth, (user) => {
        void syncUserSession(user, user ? "authenticated" : "unauthenticated");
      });
    } catch (error) {
      setSession({
        status: "unauthenticated",
        user: null,
        idToken: null,
        lastTokenRefreshAt: null,
        error: normalizeErrorMessage(error),
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [syncUserSession]);

  useEffect(() => {
    if (session.status !== "authenticated" || !session.user) {
      return;
    }

    const authenticatedUser = session.user;

    const refreshTimer = window.setInterval(() => {
      void getIdToken(authenticatedUser, true)
        .then((token) => {
          setSession((current) => {
            if (!current.user) {
              return current;
            }

            return {
              ...current,
              idToken: token,
              lastTokenRefreshAt: Date.now(),
            };
          });
        })
        .catch((error) => {
          setSession((current) => ({
            ...current,
            error: normalizeErrorMessage(error),
          }));
        });
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshTimer);
  }, [session.status, session.user]);

  const signIn = useCallback(async ({ email, password }: SignInInput): Promise<boolean> => {
    if (!authRef.current) {
      setSession((current) => ({
        ...current,
        status: "unauthenticated",
        error: "Firebase Authentication is not configured for this environment.",
      }));
      return false;
    }

    try {
      const credential = await signInWithEmailAndPassword(authRef.current, email, password);
      const token = await getIdToken(credential.user, true);

      setSession({
        status: "authenticated",
        user: credential.user,
        idToken: token,
        lastTokenRefreshAt: Date.now(),
        error: null,
      });

      return true;
    } catch (error) {
      setSession((current) => ({
        ...current,
        status: "unauthenticated",
        error: normalizeErrorMessage(error),
      }));
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!authRef.current) {
      setSession({
        status: "unauthenticated",
        user: null,
        idToken: null,
        lastTokenRefreshAt: null,
        error: null,
      });
      return;
    }

    await firebaseSignOut(authRef.current);
    setSession({
      status: "unauthenticated",
      user: null,
      idToken: null,
      lastTokenRefreshAt: null,
      error: null,
    });
  }, []);

  const refreshIdToken = useCallback(async (): Promise<string | null> => {
    if (!session.user) {
      return null;
    }

    try {
      const token = await getIdToken(session.user, true);
      setSession((current) => ({
        ...current,
        idToken: token,
        lastTokenRefreshAt: Date.now(),
        error: null,
      }));
      return token;
    } catch (error) {
      setSession((current) => ({
        ...current,
        error: normalizeErrorMessage(error),
      }));
      return null;
    }
  }, [session.user]);

  const clearError = useCallback(() => {
    setSession((current) => ({
      ...current,
      error: null,
    }));
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      session,
      signIn,
      signOut,
      refreshIdToken,
      clearError,
    }),
    [session, signIn, signOut, refreshIdToken, clearError],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthProvider(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuthProvider must be used inside AuthProvider.");
  }

  return value;
}
