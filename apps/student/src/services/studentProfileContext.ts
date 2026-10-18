import {createContext, useContext} from "react";
import type {StudentProfileResult, StudentIdentityPhotoLifecycleResult} from "../../../../shared/contracts/studentProfile";
export interface StudentProfileContextValue {
  profile: StudentProfileResult | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  busy: boolean;
  pending: "preferences" | "enroll" | "withdraw" | null;
  restricted: boolean;
  privacyAvailable: boolean;
  canCheckDeletion: boolean;
  lifecycle: StudentIdentityPhotoLifecycleResult | null;
  reload: () => Promise<void>;
  preferences: (collapsed: boolean) => Promise<void>;
  enroll: (contentBase64: string) => Promise<void>;
  withdraw: () => Promise<void>;
  retry: () => Promise<void>;
  checkDeletion: () => Promise<void>;
}
export const StudentProfileContext = createContext<StudentProfileContextValue | null>(null);
export function useStudentProfile() {
  const value = useContext(StudentProfileContext);
  if (!value) throw new Error("Student profile context is unavailable.");
  return value;
}
export {identityTenantScope as studentIdentityScope} from "../../../../shared/services/studentProfileContract";
export function purgeLegacyStudentStorage() {
  // Never parse a stored photo or use it to establish identity/preferences.
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("student-live-photo:") || key === "student-sidebar-collapsed") keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* Hostile/disabled storage cannot grant any authority. */ }
}
