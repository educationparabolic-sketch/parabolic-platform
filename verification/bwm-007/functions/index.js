"use strict";

const functions = require("firebase-functions");

exports.apiV1 = functions.region("us-central1").https.onRequest((_request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "BWM-007 forced server failure.",
    },
    requestId: "bwm-007-production-failure",
    timestamp: new Date().toISOString(),
  });
});
