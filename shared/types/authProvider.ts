import type { User } from "firebase/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSession {
  status: AuthStatus;
  user: User | null;
  idToken: string | null;
  lastTokenRefreshAt: number | null;
  error: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthContextValue {
  session: AuthSession;
  signIn: (input: SignInInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshIdToken: () => Promise<string | null>;
  clearError: () => void;
}
