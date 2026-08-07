"use strict";

const verificationRequestId = "bwm-004-staging-verification";

function sendError(response, status, code, message) {
  response.set("Cache-Control", "no-store");
  response.status(status).json({
    success: false,
    error: {code, message},
    requestId: verificationRequestId,
    timestamp: new Date().toISOString(),
  });
}

function handleApiV1(request, response) {
  if (request.method === "OPTIONS") {
    response.set("Allow", "GET");
    sendError(
      response,
      405,
      "METHOD_NOT_ALLOWED",
      "Cross-origin requests are not enabled for this verification endpoint.",
    );
    return;
  }

  sendError(
    response,
    404,
    "NOT_FOUND",
    "BWM-004 staging verification reached the API boundary.",
  );
}

module.exports = {handleApiV1};
