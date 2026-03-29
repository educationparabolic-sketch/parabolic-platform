import {
  FirestoreQueryPlan,
  FirestoreValidatedQueryPlan,
} from "../types/firestoreQueryGovernance";
import {firestoreQueryGovernanceService} from "./firestoreQueryGovernance";

/**
 * Shared indexed-query validation wrapper for governed Firestore reads.
 */
export class IndexedQueryValidationService {
  /**
   * Validates that a Firestore query plan uses an approved indexed shape.
   * @param {FirestoreQueryPlan} plan Proposed Firestore query plan.
   * @return {FirestoreValidatedQueryPlan} Matched governance metadata.
   */
  public assertIndexedQuery(
    plan: FirestoreQueryPlan,
  ): FirestoreValidatedQueryPlan {
    return firestoreQueryGovernanceService.assertQueryPlan(plan);
  }
}

export const indexedQueryValidationService =
  new IndexedQueryValidationService();
