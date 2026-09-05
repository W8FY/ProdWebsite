(function () {
  "use strict";

  // The Web App URL is public routing information. Keep the committed value
  // as a placeholder and provide the deployed /exec URL at
  // runtime through window.W8FY_GOOGLE_APPS_SCRIPT_CONFIG.url.
  var runtimeConfig = window.W8FY_GOOGLE_APPS_SCRIPT_CONFIG || {};
  var GOOGLE_APPS_SCRIPT_URL = runtimeConfig.url || "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";
  var REQUEST_TIMEOUT_MS = 20000;

  function ApiError(message, type, status) {
    this.name = "GoogleAppsScriptApiError";
    this.message = message;
    this.type = type || "api";
    this.status = status || 0;
    this.isConnectionError = this.type === "configuration"
      || this.type === "network"
      || this.type === "timeout"
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

    var controller = new window.AbortController();
    fetchOptions.signal = controller.signal;
    var timer;
    var response;
    var responseText;
    try {
      // Race the whole read, even if fetch or the body ignores abort. Never
      // repeat a request: a timed-out write may already have been applied.
      await Promise.race([
        (async function () {
          response = await window.fetch(url.toString(), fetchOptions);
          responseText = await response.text();
        }()),
        new Promise(function (resolve, reject) {
          timer = window.setTimeout(function () {
            reject(new ApiError("The Google database request timed out after 20 seconds." +
              (fetchOptions.method === "POST" ? " It may already have succeeded. Reconnect and check the roster before trying the operation again." : " Retry Connection to try again."), "timeout"));
            controller.abort();
          }, REQUEST_TIMEOUT_MS);
        })
      ]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("The Google database request could not be fetched or read. Check the connection and Web App URL.", "network");
    } finally {
      window.clearTimeout(timer);
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
    validateNetControlOwnership: function (data) {
      return request("validateNetControlOwnership", { method: "POST", data: data });
    },
    requestNetControl: function (data) {
      return request("requestNetControl", { method: "POST", data: data });
    },
    getNetControlRequestStatus: function (data) {
      return request("getNetControlRequestStatus", { method: "POST", data: data });
    },
    getPendingNetControlRequests: function (data) {
      return request("getPendingNetControlRequests", { method: "POST", data: data });
    },
    decideNetControlRequest: function (data) {
      return request("decideNetControlRequest", { method: "POST", data: data });
    },
    releaseNetControlOwnership: function (data) {
      return request("releaseNetControlOwnership", { method: "POST", data: data });
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
