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
import {
  clearCrossPortalAuthSession,
  persistCrossPortalAuthSession,
  readCrossPortalAuthSession,
} from "./crossPortalAuthSession";
import type { PortalKey } from "./portalManifest";
import type { AuthContextValue, AuthSession, SignInInput } from "../types/authProvider";

const TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1000;
const LOCAL_TEST_PASSWORD = "Parabolic#Test115";
const LOCAL_FALLBACK_STORAGE_KEY = "parabolic.localAuthToken";

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

interface LocalAuthIdentity {
  role: "student" | "teacher" | "admin" | "director" | "vendor";
  licenseLayer: "L0" | "L1" | "L2" | "L3";
}

const LOCAL_AUTH_IDENTITIES: Record<string, LocalAuthIdentity> = {
  "student.test@parabolic.local": {role: "student", licenseLayer: "L0"},
  "teacher.test@parabolic.local": {role: "teacher", licenseLayer: "L1"},
  "admin.test@parabolic.local": {role: "admin", licenseLayer: "L3"},
  "director.test@parabolic.local": {role: "director", licenseLayer: "L3"},
  "vendor.test@parabolic.local": {role: "vendor", licenseLayer: "L0"},
};

function isLocalAuthFallbackEnabled(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildLocalTestToken(email: string, identity: LocalAuthIdentity): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "local-test",
    exp: nowSeconds + 15 * 60,
    iat: nowSeconds,
    instituteId: "inst-build-125",
    iss: "local-auth-fallback",
    licenseLayer: identity.licenseLayer,
    role: identity.role,
    sub: email,
    uid: email,
  };

  return `${encodeBase64Url(JSON.stringify({alg: "none", typ: "JWT"}))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

function tryLocalFallbackSignIn(email: string, password: string): {token: string} | null {
  if (!isLocalAuthFallbackEnabled()) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const identity = LOCAL_AUTH_IDENTITIES[normalizedEmail];
  if (!identity || password !== LOCAL_TEST_PASSWORD) {
    return null;
  }

  return {
    token: buildLocalTestToken(normalizedEmail, identity),
  };
}

function persistLocalFallbackToken(token: string): void {
  try {
    window.localStorage.setItem(LOCAL_FALLBACK_STORAGE_KEY, token);
  } catch {
    // Best-effort persistence only.
  }
}

function readPersistedLocalFallbackToken(): string | null {
  try {
    const value = window.localStorage.getItem(LOCAL_FALLBACK_STORAGE_KEY);
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function clearPersistedLocalFallbackToken(): void {
  try {
    window.localStorage.removeItem(LOCAL_FALLBACK_STORAGE_KEY);
  } catch {
    // No-op
  }
}

interface AuthProviderProps {
  children: ReactNode;
  portalKey?: PortalKey;
}

export function AuthProvider({ children, portalKey = "admin" }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession>(AUTH_SESSION_INITIAL_STATE);
  const authRef = useRef<ReturnType<typeof getFirebaseAuth> | null>(null);
  const localFallbackActiveRef = useRef(false);
  const crossPortalBridgeActiveRef = useRef(false);

  const syncUserSession = useCallback(async (user: AuthSession["user"], status: AuthSession["status"]) => {
    if ((localFallbackActiveRef.current || crossPortalBridgeActiveRef.current) && !user) {
      return;
    }

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
      localFallbackActiveRef.current = false;
      crossPortalBridgeActiveRef.current = false;
      clearPersistedLocalFallbackToken();
      const token = await getIdToken(user, false);
      persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: token });
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
  }, [portalKey]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const persistedToken = readPersistedLocalFallbackToken();
    const bridgedSession = readCrossPortalAuthSession();

    if (persistedToken && isLocalAuthFallbackEnabled()) {
      localFallbackActiveRef.current = true;
      crossPortalBridgeActiveRef.current = false;
      setSession({
        status: "authenticated",
        user: null,
        idToken: persistedToken,
        lastTokenRefreshAt: Date.now(),
        error: null,
      });
    } else if (bridgedSession) {
      crossPortalBridgeActiveRef.current = true;
      setSession({
        status: "authenticated",
        user: null,
        idToken: bridgedSession.idToken,
        lastTokenRefreshAt: bridgedSession.issuedAt,
        error: null,
      });
    }

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
          persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: token });
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
  }, [portalKey, session.status, session.user]);

  const signIn = useCallback(async ({ email, password }: SignInInput): Promise<boolean> => {
    const immediateFallback = tryLocalFallbackSignIn(email, password);
    if (immediateFallback) {
      localFallbackActiveRef.current = true;
      crossPortalBridgeActiveRef.current = false;
      persistLocalFallbackToken(immediateFallback.token);
      persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: immediateFallback.token });
      setSession({
        status: "authenticated",
        user: null,
        idToken: immediateFallback.token,
        lastTokenRefreshAt: Date.now(),
        error: null,
      });
      return true;
    }

    if (!authRef.current) {
      const fallback = tryLocalFallbackSignIn(email, password);
      if (fallback) {
        localFallbackActiveRef.current = true;
        crossPortalBridgeActiveRef.current = false;
        persistLocalFallbackToken(fallback.token);
        persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: fallback.token });
        setSession({
          status: "authenticated",
          user: null,
          idToken: fallback.token,
          lastTokenRefreshAt: Date.now(),
          error: null,
        });
        return true;
      }

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
      localFallbackActiveRef.current = false;
      crossPortalBridgeActiveRef.current = false;
      clearPersistedLocalFallbackToken();
      persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: token });

      setSession({
        status: "authenticated",
        user: credential.user,
        idToken: token,
        lastTokenRefreshAt: Date.now(),
        error: null,
      });

      return true;
    } catch (error) {
      const fallback = tryLocalFallbackSignIn(email, password);
      if (fallback) {
        localFallbackActiveRef.current = true;
        crossPortalBridgeActiveRef.current = false;
        persistLocalFallbackToken(fallback.token);
        persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: fallback.token });
        setSession({
          status: "authenticated",
          user: null,
          idToken: fallback.token,
          lastTokenRefreshAt: Date.now(),
          error: null,
        });
        return true;
      }

      setSession((current) => ({
        ...current,
        status: "unauthenticated",
        error: normalizeErrorMessage(error),
      }));
      return false;
    }
  }, [portalKey]);

  const signOut = useCallback(async () => {
    if (!authRef.current) {
      localFallbackActiveRef.current = false;
      crossPortalBridgeActiveRef.current = false;
      clearPersistedLocalFallbackToken();
      clearCrossPortalAuthSession();
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
    localFallbackActiveRef.current = false;
    crossPortalBridgeActiveRef.current = false;
    clearPersistedLocalFallbackToken();
    clearCrossPortalAuthSession();
    setSession({
      status: "unauthenticated",
      user: null,
      idToken: null,
      lastTokenRefreshAt: null,
      error: null,
    });
  }, []);

  const refreshIdToken = useCallback(async (): Promise<string | null> => {
    if (session.user === null && session.status === "authenticated" && session.idToken) {
      persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: session.idToken });
      return session.idToken;
    }

    if (!session.user) {
      return null;
    }

    try {
      const token = await getIdToken(session.user, true);
      persistCrossPortalAuthSession({ sourcePortal: portalKey, idToken: token });
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
  }, [portalKey, session.idToken, session.status, session.user]);

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
