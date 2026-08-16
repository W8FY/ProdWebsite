(function () {
  "use strict";

  // The Web App URL is public routing information, not a credential. Keep the
  // committed value as a placeholder and provide the deployed /exec URL at
  // runtime through window.W8FY_GOOGLE_APPS_SCRIPT_CONFIG.url.
  var runtimeConfig = window.W8FY_GOOGLE_APPS_SCRIPT_CONFIG || {};
  var GOOGLE_APPS_SCRIPT_URL = runtimeConfig.url || "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";

  function ApiError(message, type, status) {
    this.name = "GoogleAppsScriptApiError";
    this.message = message;
    this.type = type || "api";
    this.status = status || 0;
    this.isConnectionError = this.type === "configuration"
      || this.type === "network"
      || this.type === "http"
      || this.type === "invalid-response";
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function normalizedUrl() {
    return typeof GOOGLE_APPS_SCRIPT_URL === "string"
      ? GOOGLE_APPS_SCRIPT_URL.trim().replace(/\/+$/, "")
      : "";
  }

  function isConfigured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/i.test(normalizedUrl());
  }

  async function request(action, options) {
    if (!isConfigured()) {
      throw new ApiError(
        "Google Apps Script is not configured. Add the deployed Web App /exec URL to the frontend runtime configuration.",
        "configuration"
      );
    }

    var requestOptions = options || {};
    var url = new URL(normalizedUrl());
    var fetchOptions = {
      method: requestOptions.method || "GET",
      cache: "no-store",
      redirect: "follow"
    };

    if (fetchOptions.method === "GET") {
      url.searchParams.set("action", action);
      Object.keys(requestOptions.parameters || {}).forEach(function (key) {
        url.searchParams.set(key, requestOptions.parameters[key]);
      });
    } else {
      // text/plain is a CORS-simple content type. Code.gs still receives the
      // JSON text in e.postData.contents and parses it normally.
      fetchOptions.headers = { "Content-Type": "text/plain;charset=UTF-8" };
      fetchOptions.body = JSON.stringify({
        action: action,
        data: requestOptions.data || {}
      });
    }

    var response;
    try {
      response = await window.fetch(url.toString(), fetchOptions);
    } catch (error) {
      throw new ApiError("The Google database request could not be reached. Check the network connection and Web App URL.", "network");
    }

    var responseText;
    try {
      responseText = await response.text();
    } catch (error) {
      throw new ApiError("The Google database response could not be read.", "network", response.status);
    }
    if (!response.ok) {
      throw new ApiError("The Google database returned HTTP " + response.status + ".", "http", response.status);
    }

    var payload;
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      throw new ApiError("The Google database returned an invalid JSON response.", "invalid-response", response.status);
    }

    if (!payload || typeof payload !== "object" || typeof payload.success !== "boolean") {
      throw new ApiError("The Google database returned an unexpected response.", "invalid-response", response.status);
    }
    if (!payload.success) {
      throw new ApiError(
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "The Google database could not complete the request.",
        "api",
        response.status
      );
    }

    return payload.data;
  }

  window.W8FYGoogleAppsScript = {
    isConfigured: isConfigured,
    health: function () {
      return request("health");
    },
    getActiveNet: function () {
      return request("getActiveNet");
    },
    getNet: function (netId) {
      return request("getNet", { parameters: { netId: netId } });
    },
    lookupCallsign: function (callsign) {
      return request("lookupCallsign", { parameters: { callsign: callsign } });
    },
    createNet: function (data) {
      return request("createNet", { method: "POST", data: data });
    },
    addCheckIn: function (data) {
      return request("addCheckIn", { method: "POST", data: data });
    },
    updateCheckInNote: function (data) {
      return request("updateCheckInNote", {
        method: "POST",
        data: data
      });
    },
    setNetControlRole: function (data) {
      return request("setNetControlRole", { method: "POST", data: data });
    },
    removeCheckIn: function (data) {
      return request("removeCheckIn", { method: "POST", data: data });
    },
    finalizeNet: function (data) {
      return request("finalizeNet", { method: "POST", data: data });
    },
    sendReport: function (data) {
      return request("sendReport", { method: "POST", data: data });
    },
    downloadReportPdf: function (data) {
      return request("downloadReportPdf", { method: "POST", data: data });
    }
  };
}());
