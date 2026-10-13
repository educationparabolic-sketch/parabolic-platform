/* eslint-disable require-jsdoc */
import {getFirestore} from "../utils/firebaseAdmin";
export const consumerVersion = (versionId: string) => ({
  versionId, isActive: true, activationDate: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z", createdBy: "consumer_test_vendor",
  weights: {guessWeight: 0.3, phaseWeight: 0.25, easyNeglectWeight: 0.15,
    hardBiasWeight: 0.15, wrongStreakWeight: 0.15},
  thresholds: {guessFactorEasy: 1, guessFactorMedium: 1,
    guessFactorHard: 1, phaseDeviationThreshold: 20},
});
export const seedConsumerVersion = async (
  instituteId: string, versionId: string,
): Promise<void> => {
  await getFirestore().doc(
    `institutes/${instituteId}/calibration/${versionId}`,
  ).set(consumerVersion(versionId));
};
