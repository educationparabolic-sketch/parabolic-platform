"use strict";

const functions = require("firebase-functions/v1");
const {handleApiV1} = require("./handler");

exports.apiV1 = functions.region("us-central1").https.onRequest(handleApiV1);
