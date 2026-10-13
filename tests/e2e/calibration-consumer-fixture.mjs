export const calibrationConsumerFixture = (versionId) => ({
  versionId, isActive: true, activationDate: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z", createdBy: "consumer_test_vendor",
  weights: {guessWeight: 0.3, phaseWeight: 0.25, easyNeglectWeight: 0.15,
    hardBiasWeight: 0.15, wrongStreakWeight: 0.15},
  thresholds: {guessFactorEasy: 1, guessFactorMedium: 1,
    guessFactorHard: 1, phaseDeviationThreshold: 20},
});
