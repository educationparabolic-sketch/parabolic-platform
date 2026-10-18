import { getPortalApiClient } from "../../../../shared/services/portalIntegration";
import { identityKeys, identityRecord, identityContractError, identityTime, identityText,
  parseStudentProfile, parseIdentityMedia, parseIdentityLifecycle, parseIdentityPhotoState } from "../../../../shared/services/studentProfileContract";
import type {StudentProfilePreferencesRequest, StudentProfilePreferencesResult, StudentIdentityPhotoEnrollRequest,
  StudentIdentityPhotoEnrollResult, StudentIdentityPhotoWithdrawRequest, StudentIdentityPhotoWithdrawResult} from "../../../../shared/contracts/studentProfile";

const client = getPortalApiClient("student");
const options = (signal?: AbortSignal) => ({signal, handledFailureIsReady: true, retry: {maxAttempts: 1}});
const root = "/student/profile";
function receipt(value: unknown, keys: string[], expectedVersion: number) {
  const row = identityKeys(value, ["auditId", "disposition", "version", ...keys]);
  identityText(row.auditId);
  if (!["applied", "replayed"].includes(String(row.disposition)) || row.version !== expectedVersion + 1) identityContractError();
  return row;
}
export const studentProfileApi = {
  async profile(signal?: AbortSignal) { return parseStudentProfile(await client.get(root, options(signal))); },
  async preferences(body: StudentProfilePreferencesRequest, signal?: AbortSignal) {
    const value = await client.patch(root + "/preferences", {...options(signal), body});
    const row = receipt(value, ["updatedAt", "preferences"], body.expectedVersion);
    identityTime(row.updatedAt);
    const prefs = identityKeys(row.preferences, ["sidebarCollapsed"]);
    if (prefs.sidebarCollapsed !== body.preferences.sidebarCollapsed) identityContractError();
    return value as StudentProfilePreferencesResult;
  },
  async enroll(body: StudentIdentityPhotoEnrollRequest, signal?: AbortSignal) {
    const value = await client.post(root + "/identity-photo", {...options(signal), body});
    const row = receipt(value, ["committedPhoto", "replacedPhotoId"], body.expectedVersion);
    const photo = identityRecord(row.committedPhoto);
    parseIdentityPhotoState({status: "pending_review", photo, mediaAvailable: true});
    if (row.replacedPhotoId !== body.expectedPhotoId) identityContractError();
    return value as StudentIdentityPhotoEnrollResult;
  },
  async withdraw(body: StudentIdentityPhotoWithdrawRequest, signal?: AbortSignal) {
    const value = await client.post(root + "/identity-photo/withdrawal", {...options(signal), body});
    const row = receipt(value, ["withdrawnAt", "photoId", "accessRevoked"], body.expectedVersion);
    identityTime(row.withdrawnAt);
    if (row.photoId !== body.expectedPhotoId || row.accessRevoked !== true) identityContractError();
    return value as StudentIdentityPhotoWithdrawResult;
  },
  async media(photoId: string, signal?: AbortSignal) {
    return parseIdentityMedia(await client.get(`${root}/identity-photo/${encodeURIComponent(photoId)}/media`, options(signal)), photoId);
  },
  async lifecycle(photoId: string, signal?: AbortSignal) {
    return parseIdentityLifecycle(await client.get(`${root}/identity-photo/${encodeURIComponent(photoId)}/status`, options(signal)), photoId);
  },
};
