(function () {
  "use strict";

  var LAST_NET_ID_KEY = "w8fy.netCheckin.lastNetId";
  var DATABASE_ERROR_MESSAGE = "Unable to connect to the net database. Please check your internet connection and try again.";
  var NOTE_MAX_LENGTH = 80;
  var LOOKUP_DELAY_MS = 300;
  var DEFAULT_NET_TYPE = "two_meter_ncs";
  var NET_TYPE_NAMES = {
    current: "Current Net",
    two_meter_ncs: "2 Meter NCS Net",
    weather_special: "Weather/Special Net"
  };
  var STATION_TYPES = ["Home", "Mobile", "EchoLink", "Short Time"];
  var STATION_ORDER = {
    Home: 0,
    Mobile: 1,
    EchoLink: 2,
    "Short Time": 3
  };

  var elements = {};
  var state = createEmptyState();
  var databaseReady = false;
  var pdfDownloadBusy = false;
  var lookupTrackers = {
    netControl: createLookupTracker(),
    checkIn: createLookupTracker()
  };
  var noteEditorState = {
    editingCheckInId: "",
    savingCheckInId: ""
  };

  // All persistent operations go through the Google Apps Script API module so
  // the form, roster, totals, and report stay independent of the backend.
  var netRepository = {
    testConnection: async function () {
      await getDatabaseApi().health();
      return true;
    },

    createNet: async function (netData) {
      return getDatabaseApi().createNet({
        netDate: netData.netDate,
        netType: netData.netType,
        netControlCallsign: netData.netControlCallsign,
        netControlName: netData.netControlName,
        netControlStationType: netData.netControlStation,
        netControlTraffic: netData.netControlTraffic,
        startTime: netData.startTime
      });
    },

    getNetById: async function (netId) {
      return getDatabaseApi().getNet(netId);
    },

    getLatestActiveNet: async function () {
      return getDatabaseApi().getActiveNet();
    },

    addCheckIn: async function (netId, checkIn) {
      return getDatabaseApi().addCheckIn({
        netId: netId,
        callsign: checkIn.callsign,
        name: checkIn.name,
        stationType: checkIn.stationType,
        traffic: checkIn.traffic,
        note: checkIn.note
      });
    },

    removeCheckIn: async function (netId, checkInId) {
      var result = await getDatabaseApi().removeCheckIn({ netId: netId, checkInId: checkInId });
      return Boolean(result && result.removed);
    },

    updateCheckInNote: async function (netId, checkInId, note) {
      return getDatabaseApi().updateCheckInNote({
        netId: netId,
        checkInId: checkInId,
        note: note
      });
    },

    finalizeNet: async function (netId, endTime) {
      return getDatabaseApi().finalizeNet({ netId: netId, endTime: endTime });
    },

    sendNetReport: async function (netId) {
      return getDatabaseApi().sendReport({ netId: netId });
    },

    downloadReportPdf: async function (netId) {
      return getDatabaseApi().downloadReportPdf({ netId: netId });
    },

    lookupCallsign: async function (callsign) {
      return getDatabaseApi().lookupCallsign(callsign);
    }
  };

  document.addEventListener("DOMContentLoaded", initializeApplication);

  async function initializeApplication() {
    cacheElements();
    bindEvents();
    initializeLogo();
    renderApplication();
    await connectAndRestore();
  }

  function cacheElements() {
    elements.clubLogo = document.getElementById("club-logo");
    elements.logoPlaceholder = document.getElementById("logo-placeholder");
    elements.netStatus = document.getElementById("net-status");
    elements.databaseStatus = document.getElementById("database-status");
    elements.databaseMessage = document.getElementById("database-message");
    elements.netForm = document.getElementById("net-form");
    elements.netFormMessage = document.getElementById("net-form-message");
    elements.netType = document.getElementById("net-type");
    elements.netDate = document.getElementById("net-date");
    elements.netControlCallsign = document.getElementById("net-control-callsign");
    elements.netControlName = document.getElementById("net-control-name");
    elements.netControlNameStatus = document.getElementById("net-control-name-status");
    elements.startTime = document.getElementById("start-time");
    elements.endTime = document.getElementById("end-time");
    elements.startNetButton = document.getElementById("start-net-button");
    elements.activeNetArea = document.getElementById("active-net-area");
    elements.checkinForm = document.getElementById("checkin-form");
    elements.checkinFormMessage = document.getElementById("checkin-form-message");
    elements.checkinCallsign = document.getElementById("checkin-callsign");
    elements.checkinName = document.getElementById("checkin-name");
    elements.checkinNameStatus = document.getElementById("checkin-name-status");
    elements.checkinNoteGroup = document.getElementById("checkin-note-group");
    elements.checkinNote = document.getElementById("checkin-note");
    elements.checkinNoteCounter = document.getElementById("checkin-note-counter");
    elements.addCheckinButton = document.getElementById("add-checkin-button");
    elements.rosterBody = document.getElementById("roster-body");
    elements.rosterHeading = document.getElementById("roster-heading");
    elements.rosterNoteHeading = document.getElementById("roster-note-heading");
    elements.rosterCount = document.getElementById("roster-count");
    elements.finalizeNetButton = document.getElementById("finalize-net-button");
    elements.finalReportSection = document.getElementById("final-report-section");
    elements.finalReport = document.getElementById("final-report");
    elements.emailStatusPanel = document.getElementById("email-status-panel");
    elements.emailStatusTitle = document.getElementById("email-status-title");
    elements.emailStatusMessage = document.getElementById("email-status-message");
    elements.retryEmailButton = document.getElementById("retry-email-button");
    elements.downloadReportPdfButton = document.getElementById("download-report-pdf-button");
    elements.pdfDownloadStatus = document.getElementById("pdf-download-status");
    elements.startNewNetButton = document.getElementById("start-new-net-button");
    elements.totalCheckins = document.getElementById("total-checkins");
    elements.totalTraffic = document.getElementById("total-traffic");
    elements.totalHome = document.getElementById("total-home");
    elements.totalMobile = document.getElementById("total-mobile");
    elements.totalEcholink = document.getElementById("total-echolink");
    elements.totalShortTime = document.getElementById("total-short-time");
  }

  function bindEvents() {
    elements.netForm.addEventListener("submit", startNet);
    elements.checkinForm.addEventListener("submit", addCheckIn);
    elements.rosterBody.addEventListener("click", handleRosterAction);
    elements.rosterBody.addEventListener("input", handleRosterInput);
    elements.finalizeNetButton.addEventListener("click", finalizeNet);
    elements.retryEmailButton.addEventListener("click", retryEmail);
    elements.downloadReportPdfButton.addEventListener("click", downloadFinalReportPdf);
    elements.startNewNetButton.addEventListener("click", startNewNet);
    elements.endTime.addEventListener("change", function () {
      if (state.active && !state.finalized) {
        state.endTime = cleanText(elements.endTime.value);
      }
    });

    elements.netType.addEventListener("change", function () {
      if (!state.active) {
        state.netType = normalizeNetType(elements.netType.value);
      }
    });
    elements.netControlCallsign.addEventListener("input", function (event) {
      uppercaseCallsignInput(event);
      scheduleCallsignLookup("netControl", elements.netControlCallsign, elements.netControlName, elements.netControlNameStatus);
    });
    elements.checkinCallsign.addEventListener("input", function (event) {
      uppercaseCallsignInput(event);
      scheduleCallsignLookup("checkIn", elements.checkinCallsign, elements.checkinName, elements.checkinNameStatus);
    });
    elements.netControlName.addEventListener("input", function () {
      markNameEdited("netControl", elements.netControlNameStatus);
    });
    elements.checkinName.addEventListener("input", function () {
      markNameEdited("checkIn", elements.checkinNameStatus);
    });
    elements.checkinNote.addEventListener("input", updateNoteCounter);

    document.querySelectorAll("input[type='radio']").forEach(function (input) {
      input.addEventListener("change", function () {
        var group = input.closest("fieldset");
        if (group) {
          group.classList.remove("is-invalid-group");
        }
      });
    });
  }

  async function connectAndRestore() {
    setDatabaseStatus("checking");

    if (!window.W8FYGoogleAppsScript || !window.W8FYGoogleAppsScript.isConfigured()) {
      setDatabaseStatus("offline");
      showMessage(elements.netFormMessage, "Google Apps Script is not configured. Supply the deployed Web App /exec URL in the frontend runtime configuration.");
      return;
    }

    try {
      if (!await netRepository.testConnection()) {
        throw new Error("The Google database health check returned an unexpected status.");
      }
    } catch (error) {
      handleDatabaseFailure();
      return;
    }

    // The read-only query above is the database connectivity result. Restoring
    // a browser's saved net is a separate operation and must not overwrite a
    // successful connection status (for example, after test data was reset).
    setDatabaseStatus("connected");

    try {
      await restoreSavedOrActiveNet();
      renderApplication();
    } catch (error) {
      console.warn("Google database connected, but the saved net could not be restored. The saved browser pointer was cleared.", error);
      clearLastNetId();
      state = createEmptyState();
      renderApplication();
      showMessage(elements.netFormMessage, "Google database connected. The previously saved net could not be restored, so the Start Net screen was reset.");
    }
  }

  async function restoreSavedOrActiveNet() {
    var savedNetId = getLastNetId();
    var netPayload = null;

    if (savedNetId) {
      netPayload = await netRepository.getNetById(savedNetId);
      if (!netPayload) {
        clearLastNetId();
      }
    }

    if (!netPayload) {
      netPayload = await netRepository.getLatestActiveNet();
    }

    if (!netPayload || !netPayload.net) {
      state = createEmptyState();
      return;
    }

    setLastNetId(netPayload.net.id);
    loadNetIntoState(netPayload);
  }

  function loadNetIntoState(netPayload) {
    resetNoteEditorState();
    state = mapDatabaseNet(netPayload.net, netPayload.checkIns || [], netPayload.report);
  }

  async function reloadCurrentNet() {
    if (!state.id) {
      return;
    }

    var netPayload = await netRepository.getNetById(state.id);
    if (!netPayload || !netPayload.net) {
      throw new Error("The current net could not be found in the database.");
    }
    loadNetIntoState(netPayload);
  }

  function createEmptyState() {
    return {
      id: "",
      active: false,
      finalized: false,
      netType: DEFAULT_NET_TYPE,
      netDate: getTodayDate(),
      netControlCallsign: "",
      netControlName: "",
      netControlStation: "",
      netControlTraffic: "",
      startTime: "",
      endTime: "",
      emailSent: false,
      emailSentAt: "",
      emailStatus: "idle",
      emailError: "",
      authoritativeReportText: "",
      checkIns: []
    };
  }

  function mapDatabaseNet(netRecord, checkInRecords, report) {
    var mappedCheckIns = (checkInRecords || []).map(mapDatabaseCheckIn).filter(Boolean);
    var netControl = mappedCheckIns.find(function (entry) { return entry.isNetControl; });
    return {
      id: cleanText(netRecord.id),
      active: true,
      finalized: Boolean(netRecord.finalized),
      netType: normalizeNetType(netRecord.net_type),
      netDate: cleanText(netRecord.net_date),
      netControlCallsign: normalizeCallsign(netRecord.net_control_callsign),
      netControlName: netControl ? netControl.name : "",
      netControlStation: cleanText(netRecord.net_control_station_type),
      netControlTraffic: netRecord.net_control_traffic ? "Yes" : "No",
      startTime: normalizeDatabaseTime(netRecord.start_time),
      endTime: normalizeDatabaseTime(netRecord.end_time),
      emailSent: Boolean(netRecord.email_sent),
      emailSentAt: cleanText(netRecord.email_sent_at),
      emailStatus: netRecord.email_sent ? "sent" : (netRecord.finalized ? "failed" : "idle"),
      emailError: "",
      authoritativeReportText: report && typeof report.text === "string" ? report.text : "",
      checkIns: mappedCheckIns
    };
  }

  function mapDatabaseCheckIn(record) {
    if (!record || !record.id || !record.callsign || !validStation(record.station_type)) {
      return null;
    }

    return {
      id: cleanText(record.id),
      callsign: normalizeCallsign(record.callsign),
      name: cleanText(record.name),
      stationType: record.station_type,
      traffic: record.traffic ? "Yes" : "No",
      note: cleanText(record.note),
      isNetControl: Boolean(record.is_net_control),
      createdAt: cleanText(record.created_at)
    };
  }

  async function startNet(event) {
    event.preventDefault();
    clearMessage(elements.netFormMessage);
    clearNetValidation();

    if (!databaseReady) {
      showMessage(elements.netFormMessage, DATABASE_ERROR_MESSAGE);
      return;
    }

    if (state.active) {
      showMessage(elements.netFormMessage, "A net is already active.");
      return;
    }

    var netType = normalizeNetType(elements.netType.value);
    var netDate = cleanText(elements.netDate.value);
    var callsign = normalizeCallsign(elements.netControlCallsign.value);
    var name = cleanText(elements.netControlName.value);
    var station = getSelectedValue("netControlStation");
    var traffic = getSelectedValue("netControlTraffic");
    var errors = [];

    if (!netDate) {
      errors.push("Choose the net date.");
      elements.netDate.classList.add("is-invalid");
    }
    if (!callsign) {
      errors.push("Enter the Net Control callsign.");
      elements.netControlCallsign.classList.add("is-invalid");
    }
    if (!station) {
      errors.push("Choose the Net Control station type.");
      document.getElementById("net-control-station-group").classList.add("is-invalid-group");
    }
    if (!traffic) {
      errors.push("Choose whether Net Control has traffic.");
      document.getElementById("net-control-traffic-group").classList.add("is-invalid-group");
    }

    if (errors.length) {
      showMessage(elements.netFormMessage, errors.join(" "));
      focusFirstInvalid(elements.netForm);
      return;
    }

    var startTime = cleanText(elements.startTime.value) || getCurrentTime();
    var netDraft = {
      netType: netType,
      netDate: netDate,
      netControlCallsign: callsign,
      netControlName: name,
      netControlStation: station,
      netControlTraffic: traffic,
      startTime: startTime
    };
    var createdPayload = null;

    invalidateLookup("netControl");
    setButtonBusy(elements.startNetButton, true, "Starting Net…");

    try {
      createdPayload = await netRepository.createNet(netDraft);
      if (!createdPayload || !createdPayload.net) {
        throw new Error("The Google database did not return the created net.");
      }
      setLastNetId(createdPayload.net.id);
      loadNetIntoState(createdPayload);
      renderApplication();
      elements.checkinCallsign.focus();
    } catch (error) {
      showOperationError(elements.netFormMessage, "The net was not saved.", error);
    } finally {
      setButtonBusy(elements.startNetButton, false, "Start Net");
      setInterfaceLocking();
    }
  }

  async function addCheckIn(event) {
    event.preventDefault();
    clearMessage(elements.checkinFormMessage);
    clearCheckInValidation();

    if (!databaseReady || !state.active || state.finalized) {
      showMessage(elements.checkinFormMessage, DATABASE_ERROR_MESSAGE);
      return;
    }

    var callsign = normalizeCallsign(elements.checkinCallsign.value);
    var name = cleanText(elements.checkinName.value);
    var station = getSelectedValue("checkinStation");
    var traffic = getSelectedValue("checkinTraffic");
    var note = isWeatherNet() ? cleanText(elements.checkinNote.value) : "";
    var errors = [];

    if (!callsign) {
      errors.push("Enter a callsign.");
      elements.checkinCallsign.classList.add("is-invalid");
    }
    if (!station) {
      errors.push("Choose a station type.");
      document.getElementById("checkin-station-group").classList.add("is-invalid-group");
    }
    if (!traffic) {
      errors.push("Choose whether the station has traffic.");
      document.getElementById("checkin-traffic-group").classList.add("is-invalid-group");
    }
    if (note.length > NOTE_MAX_LENGTH) {
      errors.push("Note must be 80 characters or fewer.");
      elements.checkinNote.classList.add("is-invalid");
    }

    if (errors.length) {
      showMessage(elements.checkinFormMessage, errors.join(" "));
      focusFirstInvalid(elements.checkinForm);
      return;
    }

    var duplicate = state.checkIns.some(function (entry) {
      return entry.callsign === callsign;
    });

    if (duplicate) {
      elements.checkinCallsign.classList.add("is-invalid");
      showMessage(elements.checkinFormMessage, callsign + " is already checked in. Each callsign can only be added once.");
      elements.checkinCallsign.focus();
      return;
    }

    invalidateLookup("checkIn");
    setButtonBusy(elements.addCheckinButton, true, "Saving…");

    try {
      await netRepository.addCheckIn(state.id, {
        callsign: callsign,
        name: name,
        stationType: station,
        traffic: traffic,
        note: note,
        isNetControl: false
      });
      await reloadCurrentNet();
      renderRoster();
      renderTotals();
      resetCheckInForm();
      showMessage(elements.checkinFormMessage, callsign + " was saved to the net.", true);
      elements.checkinCallsign.focus();
    } catch (error) {
      if (isDuplicateDatabaseError(error)) {
        showMessage(elements.checkinFormMessage, callsign + " is already checked in. Each callsign can only be added once.");
      } else {
        showOperationError(elements.checkinFormMessage, callsign + " was not saved.", error);
      }
    } finally {
      setButtonBusy(elements.addCheckinButton, false, "Add Check-In");
      setInterfaceLocking();
    }
  }

  function handleRosterAction(event) {
    var editNoteButton = event.target.closest("[data-edit-note-id]");
    if (editNoteButton) {
      startEditingNote(editNoteButton.getAttribute("data-edit-note-id"));
      return;
    }

    var saveNoteButton = event.target.closest("[data-save-note-id]");
    if (saveNoteButton) {
      saveEditedNote(saveNoteButton.getAttribute("data-save-note-id"));
      return;
    }

    var cancelNoteButton = event.target.closest("[data-cancel-note-id]");
    if (cancelNoteButton) {
      cancelEditingNote(cancelNoteButton.getAttribute("data-cancel-note-id"));
      return;
    }

    var removeButton = event.target.closest("[data-remove-id]");
    if (removeButton) {
      removeCheckIn(removeButton.getAttribute("data-remove-id"));
    }
  }

  function handleRosterInput(event) {
    var textarea = event.target.closest("[data-note-editor-id]");
    if (textarea) {
      updateRosterNoteCounter(textarea);
    }
  }

  function startEditingNote(checkInId) {
    if (!canEditRosterNotes() || noteEditorState.savingCheckInId) {
      return;
    }
    var entry = findCheckIn(checkInId);
    if (!entry) {
      return;
    }

    noteEditorState.editingCheckInId = entry.id;
    renderRoster();
    var textarea = getRosterNoteTextarea(entry.id);
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  function cancelEditingNote(checkInId) {
    if (noteEditorState.savingCheckInId || noteEditorState.editingCheckInId !== checkInId) {
      return;
    }
    noteEditorState.editingCheckInId = "";
    renderRoster();
  }

  async function saveEditedNote(checkInId) {
    if (!canEditRosterNotes() || noteEditorState.savingCheckInId || noteEditorState.editingCheckInId !== checkInId) {
      return;
    }

    var entry = findCheckIn(checkInId);
    var textarea = getRosterNoteTextarea(checkInId);
    if (!entry || !textarea) {
      return;
    }

    var note = cleanText(textarea.value);
    if (note.length > NOTE_MAX_LENGTH) {
      textarea.classList.add("is-invalid");
      showRosterNoteError(textarea, "Note must be 80 characters or fewer.");
      return;
    }

    noteEditorState.savingCheckInId = checkInId;
    setRosterNoteEditorBusy(textarea, true);
    setInterfaceLocking();

    try {
      var updatedRecord = await netRepository.updateCheckInNote(state.id, checkInId, note);
      var updatedEntry = mapDatabaseCheckIn(updatedRecord);
      if (!updatedEntry || updatedEntry.id !== checkInId) {
        throw new Error("The database did not return the updated check-in.");
      }
      state.checkIns = state.checkIns.map(function (checkIn) {
        return checkIn.id === checkInId ? updatedEntry : checkIn;
      });
      noteEditorState.editingCheckInId = "";
      noteEditorState.savingCheckInId = "";
      renderRoster();
      setInterfaceLocking();
      showMessage(elements.checkinFormMessage, entry.callsign + " note was saved.", true);
    } catch (error) {
      noteEditorState.savingCheckInId = "";
      setRosterNoteEditorBusy(textarea, false);
      setInterfaceLocking();
      showRosterNoteError(textarea, "The note was not saved. " + getErrorMessage(error));
    }
  }

  async function removeCheckIn(checkInId) {
    if (!databaseReady || state.finalized || noteEditorState.savingCheckInId) {
      return;
    }

    var entry = state.checkIns.find(function (checkIn) {
      return checkIn.id === checkInId;
    });

    if (!entry || entry.isNetControl) {
      return;
    }

    if (!window.confirm("Remove " + entry.callsign + " from the current net?")) {
      return;
    }

    try {
      var removed = await netRepository.removeCheckIn(state.id, entry.id);
      if (!removed) {
        showMessage(elements.checkinFormMessage, entry.callsign + " could not be removed. It may already be gone or protected.");
        return;
      }
      await reloadCurrentNet();
      renderRoster();
      renderTotals();
      showMessage(elements.checkinFormMessage, entry.callsign + " was removed from the net.", true);
    } catch (error) {
      showOperationError(elements.checkinFormMessage, entry.callsign + " was not removed.", error);
      setInterfaceLocking();
    }
  }

  async function finalizeNet() {
    if (!databaseReady || !state.active || state.finalized || noteEditorState.savingCheckInId) {
      return;
    }

    if (!window.confirm("Finalize this net? Check-ins and net information will be locked.")) {
      return;
    }

    var endTime = cleanText(elements.endTime.value) || getCurrentTime();
    setButtonBusy(elements.finalizeNetButton, true, "Finalizing…");

    try {
      var finalizedPayload = await netRepository.finalizeNet(state.id, endTime);
      if (!finalizedPayload || !finalizedPayload.net) {
        throw new Error("The Google database did not return the finalized net.");
      }
      loadNetIntoState(finalizedPayload);
      renderApplication();
      elements.finalReportSection.scrollIntoView({ behavior: "smooth", block: "start" });
      await sendFinalizedNetReport();
    } catch (error) {
      showOperationError(elements.checkinFormMessage, "The net was not finalized.", error);
    } finally {
      setButtonBusy(elements.finalizeNetButton, false, "Finalize Net");
      setInterfaceLocking();
    }
  }

  async function retryEmail() {
    if (!databaseReady || !state.finalized || state.emailSent || state.emailStatus === "sending") {
      return;
    }
    await sendFinalizedNetReport();
  }

  async function sendFinalizedNetReport() {
    if (!state.id || !state.finalized || state.emailSent) {
      return;
    }

    state.emailStatus = "sending";
    state.emailError = "";
    renderStatus();
    renderEmailStatus();
    setButtonBusy(elements.retryEmailButton, true, "Sending…");

    try {
      await netRepository.sendNetReport(state.id);
      await reloadCurrentNet();
      state.emailStatus = "sent";
      state.emailError = "";
    } catch (error) {
      state.emailSent = false;
      state.emailStatus = "failed";
      state.emailError = error && error.message ? error.message : "The report email could not be sent.";
    } finally {
      setButtonBusy(elements.retryEmailButton, false, "Retry Email");
      renderStatus();
      renderEmailStatus();
      setInterfaceLocking();
    }
  }

  async function downloadFinalReportPdf() {
    if (!databaseReady || !state.id || !state.finalized || pdfDownloadBusy) {
      return;
    }

    pdfDownloadBusy = true;
    setPdfDownloadStatus("Generating the final report PDF…", "pending");
    setButtonBusy(elements.downloadReportPdfButton, true, "Generating PDF…");
    setInterfaceLocking();

    try {
      var payload = await netRepository.downloadReportPdf(state.id);
      var pdfFile = validatePdfDownloadPayload(payload);
      triggerPdfDownload(pdfFile);
      setPdfDownloadStatus("The final report PDF was downloaded successfully.", "success");
    } catch (error) {
      setPdfDownloadStatus("The final report PDF could not be downloaded. " + getErrorMessage(error), "error");
    } finally {
      pdfDownloadBusy = false;
      setButtonBusy(elements.downloadReportPdfButton, false, "Download Final Report PDF");
      setInterfaceLocking();
    }
  }

  function startNewNet() {
    if (!state.finalized) {
      return;
    }

    if (!window.confirm("Start a new net? The finalized net will remain in Google Sheets, and this browser will return to the Start Net screen.")) {
      return;
    }

    clearLastNetId();
    resetNoteEditorState();
    pdfDownloadBusy = false;
    setPdfDownloadStatus("", "");
    state = createEmptyState();
    elements.netForm.reset();
    resetCheckInForm();
    resetLookupTracker("netControl", elements.netControlNameStatus);
    clearMessage(elements.netFormMessage);
    clearMessage(elements.checkinFormMessage);
    renderApplication();
    elements.netControlCallsign.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderApplication() {
    populateNetForm();
    renderNetTypeFeatures();
    renderStatus();
    renderRoster();
    renderTotals();
    renderFinalReport();
    renderEmailStatus();
    setInterfaceLocking();
  }

  function renderNetTypeFeatures() {
    var includeNotes = isWeatherNet();
    elements.checkinNoteGroup.hidden = !includeNotes;
    elements.rosterNoteHeading.hidden = !includeNotes;
    elements.rosterHeading.textContent = getNetTypeName(state.netType) + " Roster";
    elements.rosterBody.closest("table").classList.toggle("weather-roster", includeNotes);
    if (!includeNotes) {
      elements.checkinNote.value = "";
    }
    updateNoteCounter();
  }

  function populateNetForm() {
    elements.netType.value = state.netType;
    elements.netDate.value = state.netDate || getTodayDate();
    elements.netControlCallsign.value = state.netControlCallsign;
    elements.netControlName.value = state.netControlName;
    elements.startTime.value = state.startTime;
    elements.endTime.value = state.endTime;
    setRadioValue("netControlStation", state.netControlStation);
    setRadioValue("netControlTraffic", state.netControlTraffic);
  }

  function renderStatus() {
    elements.netStatus.className = "net-status";

    if (state.finalized && state.emailSent) {
      elements.netStatus.textContent = "NET FINALIZED — EMAIL SENT";
      elements.netStatus.classList.add("status-emailed");
    } else if (state.finalized && state.emailStatus === "failed") {
      elements.netStatus.textContent = "NET FINALIZED — EMAIL FAILED";
      elements.netStatus.classList.add("status-email-failed");
    } else if (state.finalized && state.emailStatus === "sending") {
      elements.netStatus.textContent = "NET FINALIZED — SENDING REPORT";
      elements.netStatus.classList.add("status-finalized");
    } else if (state.finalized) {
      elements.netStatus.textContent = "NET FINALIZED";
      elements.netStatus.classList.add("status-finalized");
    } else if (state.active) {
      elements.netStatus.textContent = "NET ACTIVE";
      elements.netStatus.classList.add("status-active");
    } else {
      elements.netStatus.textContent = "READY";
      elements.netStatus.classList.add("status-ready");
    }
  }

  function setDatabaseStatus(status) {
    elements.databaseStatus.className = "database-status";
    databaseReady = status === "connected";

    if (status === "connected") {
      elements.databaseStatus.classList.add("database-connected");
      elements.databaseStatus.lastElementChild.textContent = "Google Database: Connected";
      elements.databaseMessage.hidden = true;
      elements.databaseMessage.textContent = "";
    } else if (status === "offline") {
      elements.databaseStatus.classList.add("database-offline");
      elements.databaseStatus.lastElementChild.textContent = "Google Database: Offline";
      elements.databaseMessage.textContent = DATABASE_ERROR_MESSAGE;
      elements.databaseMessage.hidden = false;
    } else {
      elements.databaseStatus.classList.add("database-checking");
      elements.databaseStatus.lastElementChild.textContent = "Google Database: Checking";
      elements.databaseMessage.hidden = true;
    }

    setInterfaceLocking();
  }

  function handleDatabaseFailure() {
    setDatabaseStatus("offline");
    showMessage(elements.netFormMessage, DATABASE_ERROR_MESSAGE);
  }

  function setInterfaceLocking() {
    elements.activeNetArea.hidden = !state.active;
    elements.finalReportSection.hidden = !state.finalized;

    elements.netForm.querySelectorAll("input, select, button").forEach(function (control) {
      if (control === elements.endTime) {
        control.disabled = !databaseReady || !state.active || state.finalized;
      } else {
        control.disabled = !databaseReady || state.active;
      }
    });

    elements.checkinForm.querySelectorAll("input, textarea, button").forEach(function (control) {
      control.disabled = !databaseReady || !state.active || state.finalized;
    });

    elements.finalizeNetButton.disabled = !databaseReady || !state.active || state.finalized || Boolean(noteEditorState.savingCheckInId);
    elements.retryEmailButton.disabled = !databaseReady || !state.finalized || state.emailSent || state.emailStatus === "sending";
    elements.downloadReportPdfButton.hidden = !state.finalized;
    elements.downloadReportPdfButton.disabled = !databaseReady || !state.finalized || pdfDownloadBusy;
    elements.startNewNetButton.disabled = !state.finalized || pdfDownloadBusy;
  }

  function renderRoster() {
    elements.rosterBody.replaceChildren();
    // The Apps Script backend returns check-ins in authoritative report order.
    var sorted = state.checkIns.slice();
    var includeNotes = isWeatherNet();
    var allowNoteEditing = canEditRosterNotes();

    sorted.forEach(function (entry, index) {
      var row = document.createElement("tr");
      if (entry.traffic === "Yes") {
        row.classList.add("traffic-row");
      }
      if (entry.isNetControl) {
        row.classList.add("net-control-row");
      }

      appendTextCell(row, String(index + 1));
      var callsignCell = appendTextCell(row, entry.callsign);
      callsignCell.classList.add("callsign-cell");
      if (entry.isNetControl) {
        callsignCell.appendChild(createBadge("NET CONTROL", "badge-net-control ms-2"));
      }

      appendTextCell(row, displaySavedName(entry.name));

      var stationCell = document.createElement("td");
      stationCell.appendChild(createBadge(entry.stationType, "badge-station " + stationClass(entry.stationType)));
      row.appendChild(stationCell);

      var trafficCell = document.createElement("td");
      trafficCell.appendChild(createBadge(entry.traffic, entry.traffic === "Yes" ? "badge-traffic" : "badge-traffic badge-no-traffic"));
      row.appendChild(trafficCell);

      if (includeNotes) {
        var noteCell = document.createElement("td");
        noteCell.classList.add("roster-note-cell");
        renderRosterNoteCell(noteCell, entry, allowNoteEditing);
        row.appendChild(noteCell);
      }

      var actionCell = document.createElement("td");
      if (entry.isNetControl) {
        actionCell.appendChild(createBadge("Locked", "badge-locked"));
      } else {
        var removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn btn-outline-danger btn-sm remove-checkin-button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("data-remove-id", entry.id);
        removeButton.setAttribute("aria-label", "Remove " + entry.callsign + " from the net");
        removeButton.disabled = !databaseReady || state.finalized;
        actionCell.appendChild(removeButton);
      }
      row.appendChild(actionCell);
      elements.rosterBody.appendChild(row);
    });

    elements.rosterCount.textContent = sorted.length + (sorted.length === 1 ? " station" : " stations");
  }

  function renderTotals() {
    var totals = calculateTotals(state.checkIns);
    elements.totalCheckins.textContent = totals.total;
    elements.totalTraffic.textContent = totals.traffic;
    elements.totalHome.textContent = totals.Home;
    elements.totalMobile.textContent = totals.Mobile;
    elements.totalEcholink.textContent = totals.EchoLink;
    elements.totalShortTime.textContent = totals["Short Time"];
  }

  function renderFinalReport() {
    elements.finalReport.textContent = state.finalized
      ? (state.authoritativeReportText || generateFinalReport(state))
      : "";
  }

  function renderEmailStatus() {
    elements.emailStatusPanel.className = "email-status-panel";
    elements.retryEmailButton.hidden = true;

    if (state.emailSent || state.emailStatus === "sent") {
      elements.emailStatusPanel.classList.add("email-sent");
      elements.emailStatusTitle.textContent = "Email sent";
      elements.emailStatusMessage.textContent = state.emailSentAt ? "Sent at " + formatDateTime(state.emailSentAt) + "." : "The final report was emailed successfully.";
    } else if (state.emailStatus === "failed") {
      elements.emailStatusPanel.classList.add("email-failed");
      elements.emailStatusTitle.textContent = "Email failed";
      elements.emailStatusMessage.textContent = state.emailError || "The net remains finalized. Use Retry Email to try again.";
      elements.retryEmailButton.hidden = false;
    } else if (state.emailStatus === "sending") {
      elements.emailStatusTitle.textContent = "Sending report…";
      elements.emailStatusMessage.textContent = "The net is finalized. Please wait while the email is submitted.";
    } else {
      elements.emailStatusTitle.textContent = "Email status pending";
      elements.emailStatusMessage.textContent = "The report will be emailed after finalization.";
    }
  }

  function sortCheckIns(checkIns) {
    return checkIns.slice().sort(function (left, right) {
      var trafficDifference = (left.traffic === "Yes" ? 0 : 1) - (right.traffic === "Yes" ? 0 : 1);
      if (trafficDifference !== 0) {
        return trafficDifference;
      }

      var stationDifference = STATION_ORDER[left.stationType] - STATION_ORDER[right.stationType];
      if (stationDifference !== 0) {
        return stationDifference;
      }

      return left.callsign.localeCompare(right.callsign, "en", { sensitivity: "base" });
    });
  }

  function calculateTotals(checkIns) {
    var totals = { total: checkIns.length, traffic: 0, Home: 0, Mobile: 0, EchoLink: 0, "Short Time": 0 };
    checkIns.forEach(function (entry) {
      if (entry.traffic === "Yes") {
        totals.traffic += 1;
      }
      if (Object.prototype.hasOwnProperty.call(totals, entry.stationType)) {
        totals[entry.stationType] += 1;
      }
    });
    return totals;
  }

  function generateFinalReport(netState) {
    var sorted = netState.checkIns.slice();
    var totals = calculateTotals(sorted);
    var lines = [
      "W8FY AMATEUR RADIO NET REPORT",
      "",
      "Net Type: " + getNetTypeName(netState.netType),
      "Net Date: " + netState.netDate,
      "Net Control: " + netState.netControlCallsign,
      "Start Time: " + formatTime(netState.startTime),
      "End Time: " + formatTime(netState.endTime),
      "Net Duration: " + calculateDurationMinutes(netState.startTime, netState.endTime) + " minutes",
      "",
      "--------------------------------",
      "",
      "TRAFFIC",
      ""
    ];

    appendReportGroups(lines, sorted, "Yes", netState.netType === "weather_special");
    lines.push("", "--------------------------------", "", "NO TRAFFIC", "");
    appendReportGroups(lines, sorted, "No", netState.netType === "weather_special");
    lines.push(
      "", "--------------------------------", "",
      "TOTAL CHECK-INS: " + totals.total,
      "TRAFFIC: " + totals.traffic,
      "HOME: " + totals.Home,
      "MOBILE: " + totals.Mobile,
      "ECHOLINK: " + totals.EchoLink,
      "SHORT TIME: " + totals["Short Time"]
    );
    return lines.join("\n");
  }

  function appendReportGroups(lines, sorted, trafficValue, includeNotes) {
    STATION_TYPES.forEach(function (stationType) {
      lines.push(stationType);
      var matching = sorted.filter(function (entry) {
        return entry.traffic === trafficValue && entry.stationType === stationType;
      });
      if (matching.length) {
        matching.forEach(function (entry) {
          lines.push(
            "  " + entry.callsign +
            " - " + (entry.name || "N/A") +
            " - " + entry.stationType +
            " - " + (entry.traffic === "Yes" ? "Traffic" : "No Traffic") +
            (includeNotes ? " - Note: " + (entry.note || "N/A") : "") +
            (entry.isNetControl ? "  [NET CONTROL]" : "")
          );
        });
      } else {
        lines.push("  —");
      }
      lines.push("");
    });
  }

  function createLookupTracker() {
    return {
      sequence: 0,
      callsign: "",
      nameEdited: false,
      timer: null
    };
  }

  function scheduleCallsignLookup(key, callsignInput, nameInput, statusElement) {
    var tracker = lookupTrackers[key];
    var callsign = normalizeCallsign(callsignInput.value);
    tracker.sequence += 1;
    tracker.callsign = callsign;
    tracker.nameEdited = false;
    window.clearTimeout(tracker.timer);
    tracker.timer = null;
    nameInput.value = "";
    statusElement.textContent = "";

    if (!databaseReady || !callsign) {
      return;
    }

    var requestSequence = tracker.sequence;
    tracker.timer = window.setTimeout(function () {
      tracker.timer = null;
      performCallsignLookup(key, callsignInput, nameInput, statusElement, callsign, requestSequence);
    }, LOOKUP_DELAY_MS);
  }

  async function performCallsignLookup(key, callsignInput, nameInput, statusElement, callsign, requestSequence) {
    var tracker = lookupTrackers[key];
    statusElement.textContent = "Looking up callsign…";

    try {
      var result = await netRepository.lookupCallsign(callsign);
      if (tracker.sequence !== requestSequence ||
          tracker.nameEdited ||
          normalizeCallsign(callsignInput.value) !== callsign) {
        return;
      }

      if (result && result.found) {
        nameInput.value = typeof result.name === "string" ? result.name : "";
        statusElement.textContent = "Directory name found. You can edit it.";
      } else {
        nameInput.value = "";
        statusElement.textContent = "No directory name found. Enter a name if known.";
      }
    } catch (error) {
      if (tracker.sequence === requestSequence && !tracker.nameEdited) {
        statusElement.textContent = "Name lookup unavailable. Enter a name manually.";
      }
    }
  }

  function markNameEdited(key, statusElement) {
    var tracker = lookupTrackers[key];
    tracker.sequence += 1;
    tracker.nameEdited = true;
    window.clearTimeout(tracker.timer);
    tracker.timer = null;
    statusElement.textContent = "Name entered manually.";
  }

  function invalidateLookup(key) {
    var tracker = lookupTrackers[key];
    tracker.sequence += 1;
    window.clearTimeout(tracker.timer);
    tracker.timer = null;
  }

  function resetLookupTracker(key, statusElement) {
    invalidateLookup(key);
    lookupTrackers[key].callsign = "";
    lookupTrackers[key].nameEdited = false;
    statusElement.textContent = "";
  }

  function updateNoteCounter() {
    var length = elements.checkinNote.value.length;
    elements.checkinNoteCounter.textContent = length + " / " + NOTE_MAX_LENGTH;
    elements.checkinNoteCounter.classList.toggle("limit-reached", length >= NOTE_MAX_LENGTH);
    elements.checkinNoteCounter.classList.toggle("over-limit", length > NOTE_MAX_LENGTH);
    if (length <= NOTE_MAX_LENGTH) {
      elements.checkinNote.classList.remove("is-invalid");
    }
  }

  function getDatabaseApi() {
    var api = window.W8FYGoogleAppsScript;
    if (!api || !api.isConfigured()) {
      throw new Error(DATABASE_ERROR_MESSAGE);
    }
    return api;
  }

  function isDuplicateDatabaseError(error) {
    return Boolean(error && /already (?:checked in|exists)|duplicate/i.test(error.message || ""));
  }

  function showOperationError(element, prefix, error) {
    var message = error && error.message ? error.message : DATABASE_ERROR_MESSAGE;
    showMessage(element, prefix + " " + message);
    if (error && error.isConnectionError) {
      setDatabaseStatus("offline");
    }
  }

  function setLastNetId(netId) {
    try {
      window.localStorage.setItem(LAST_NET_ID_KEY, netId);
    } catch (error) {
      // Google Sheets remains authoritative; this only affects same-browser restore.
    }
  }

  function getLastNetId() {
    try {
      return cleanText(window.localStorage.getItem(LAST_NET_ID_KEY));
    } catch (error) {
      return "";
    }
  }

  function clearLastNetId() {
    try {
      window.localStorage.removeItem(LAST_NET_ID_KEY);
    } catch (error) {
      // The next database lookup can still find the newest active net.
    }
  }

  function initializeLogo() {
    function showLogo() {
      if (elements.clubLogo.naturalWidth > 0) {
        elements.clubLogo.classList.add("loaded");
        elements.logoPlaceholder.hidden = true;
      }
    }
    function showPlaceholder() {
      elements.clubLogo.classList.remove("loaded");
      elements.logoPlaceholder.hidden = false;
    }
    elements.clubLogo.addEventListener("load", showLogo);
    elements.clubLogo.addEventListener("error", showPlaceholder);
    if (elements.clubLogo.complete) {
      elements.clubLogo.naturalWidth > 0 ? showLogo() : showPlaceholder();
    }
  }

  function uppercaseCallsignInput(event) {
    var input = event.currentTarget;
    var cursor = input.selectionStart;
    input.value = input.value.toUpperCase();
    if (cursor !== null) {
      input.setSelectionRange(cursor, cursor);
    }
    input.classList.remove("is-invalid");
  }

  function normalizeCallsign(value) {
    return cleanText(value).toUpperCase();
  }

  function normalizeNetType(value) {
    var netType = cleanText(value).toLowerCase();
    return Object.prototype.hasOwnProperty.call(NET_TYPE_NAMES, netType) ? netType : "current";
  }

  function getNetTypeName(value) {
    return NET_TYPE_NAMES[normalizeNetType(value)];
  }

  function isWeatherNet() {
    return state.netType === "weather_special";
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function displaySavedName(value) {
    var name = cleanText(value);
    return name === "" ? "—" : name;
  }

  function normalizeDatabaseTime(value) {
    var time = cleanText(value);
    return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "";
  }

  function validStation(value) {
    return STATION_TYPES.indexOf(value) !== -1;
  }

  function getSelectedValue(name) {
    var selected = document.querySelector("input[name='" + name + "']:checked");
    return selected ? selected.value : "";
  }

  function setRadioValue(name, value) {
    document.querySelectorAll("input[name='" + name + "']").forEach(function (input) {
      input.checked = input.value === value;
    });
  }

  function getTodayDate() {
    var now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function getCurrentTime() {
    var now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function formatTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
      return value || "—";
    }
    var parts = value.split(":");
    var hour = Number(parts[0]);
    return (hour % 12 || 12) + ":" + parts[1] + (hour >= 12 ? " PM" : " AM");
  }

  function calculateDurationMinutes(startTime, endTime) {
    var timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    var startMatch = cleanText(startTime).match(timePattern);
    var endMatch = cleanText(endTime).match(timePattern);
    if (!startMatch || !endMatch) {
      return 0;
    }
    var startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
    var endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
    var elapsedMinutes = endMinutes - startMinutes;
    return elapsedMinutes < 0 ? elapsedMinutes + 1440 : elapsedMinutes;
  }

  function formatDateTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value || "an unknown time";
    }
    return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function appendTextCell(row, text) {
    var cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);
    return cell;
  }

  function renderRosterNoteCell(cell, entry, allowEditing) {
    if (allowEditing && noteEditorState.editingCheckInId === entry.id) {
      var editor = document.createElement("div");
      editor.className = "roster-note-editor";

      var textarea = document.createElement("textarea");
      textarea.className = "form-control roster-note-editor-input";
      textarea.value = entry.note;
      textarea.maxLength = NOTE_MAX_LENGTH;
      textarea.rows = 3;
      textarea.setAttribute("data-note-editor-id", entry.id);
      textarea.setAttribute("aria-label", "Edit note for " + entry.callsign);
      editor.appendChild(textarea);

      var meta = document.createElement("div");
      meta.className = "roster-note-editor-meta";
      var counter = document.createElement("span");
      counter.className = "note-counter";
      counter.setAttribute("data-note-editor-counter", entry.id);
      meta.appendChild(counter);
      editor.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "roster-note-editor-actions";
      actions.appendChild(createRosterNoteButton("Save", "btn btn-primary btn-sm", "data-save-note-id", entry.id));
      actions.appendChild(createRosterNoteButton("Cancel", "btn btn-outline-secondary btn-sm", "data-cancel-note-id", entry.id));
      editor.appendChild(actions);

      var error = document.createElement("div");
      error.className = "roster-note-editor-error";
      error.hidden = true;
      error.setAttribute("role", "alert");
      editor.appendChild(error);
      cell.appendChild(editor);
      updateRosterNoteCounter(textarea);
      return;
    }

    var noteText = document.createElement("div");
    noteText.className = "roster-note-text";
    noteText.textContent = entry.note || "—";
    cell.appendChild(noteText);

    if (allowEditing) {
      cell.appendChild(createRosterNoteButton("Edit Note", "btn btn-outline-primary btn-sm edit-note-button", "data-edit-note-id", entry.id));
    }
  }

  function createRosterNoteButton(label, className, attribute, checkInId) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.setAttribute(attribute, checkInId);
    return button;
  }

  function updateRosterNoteCounter(textarea) {
    var editor = textarea.closest(".roster-note-editor");
    var counter = editor ? editor.querySelector("[data-note-editor-counter]") : null;
    if (!counter) {
      return;
    }
    var length = textarea.value.length;
    counter.textContent = length + " / " + NOTE_MAX_LENGTH;
    counter.classList.toggle("limit-reached", length >= NOTE_MAX_LENGTH);
    counter.classList.toggle("over-limit", length > NOTE_MAX_LENGTH);
    if (length <= NOTE_MAX_LENGTH) {
      textarea.classList.remove("is-invalid");
    }
  }

  function showRosterNoteError(textarea, message) {
    var editor = textarea.closest(".roster-note-editor");
    var error = editor ? editor.querySelector(".roster-note-editor-error") : null;
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function setRosterNoteEditorBusy(textarea, busy) {
    var editor = textarea.closest(".roster-note-editor");
    if (!editor) {
      return;
    }
    elements.rosterBody.querySelectorAll("[data-edit-note-id]").forEach(function (button) {
      button.disabled = busy;
    });
    editor.querySelectorAll("textarea, button").forEach(function (control) {
      control.disabled = busy;
    });
    var saveButton = editor.querySelector("[data-save-note-id]");
    if (saveButton) {
      saveButton.textContent = busy ? "Saving…" : "Save";
      saveButton.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }

  function getRosterNoteTextarea(checkInId) {
    return elements.rosterBody.querySelector('[data-note-editor-id="' + checkInId + '"]');
  }

  function findCheckIn(checkInId) {
    return state.checkIns.find(function (entry) {
      return entry.id === checkInId;
    });
  }

  function canEditRosterNotes() {
    return databaseReady && state.active && !state.finalized && isWeatherNet();
  }

  function resetNoteEditorState() {
    noteEditorState.editingCheckInId = "";
    noteEditorState.savingCheckInId = "";
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : DATABASE_ERROR_MESSAGE;
  }

  function validatePdfDownloadPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("The server returned an invalid PDF response.");
    }

    var filename = cleanText(payload.filename);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.pdf$/i.test(filename) || filename.indexOf("..") !== -1) {
      throw new Error("The server returned an invalid PDF filename.");
    }
    if (payload.mimeType !== "application/pdf") {
      throw new Error("The server returned an invalid PDF content type.");
    }
    if (typeof payload.base64 !== "string") {
      throw new Error("The server returned invalid PDF data.");
    }

    var base64 = payload.base64.trim();
    if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error("The server returned invalid PDF data.");
    }

    var binary;
    try {
      binary = window.atob(base64);
    } catch (error) {
      throw new Error("The server returned invalid PDF data.");
    }
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      throw new Error("The downloaded file is not a valid PDF.");
    }

    return {
      filename: filename,
      mimeType: payload.mimeType,
      bytes: bytes
    };
  }

  function triggerPdfDownload(pdfFile) {
    var blob = new window.Blob([pdfFile.bytes], { type: "application/pdf" });
    var objectUrl = window.URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = pdfFile.filename;
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    }
  }

  function setPdfDownloadStatus(message, status) {
    elements.pdfDownloadStatus.className = "pdf-download-status";
    elements.pdfDownloadStatus.textContent = message;
    elements.pdfDownloadStatus.hidden = !message;
    if (status) {
      elements.pdfDownloadStatus.classList.add("pdf-download-status-" + status);
    }
  }

  function createBadge(text, className) {
    var badge = document.createElement("span");
    badge.className = className;
    badge.textContent = text;
    return badge;
  }

  function stationClass(stationType) {
    return "station-" + stationType.toLowerCase().replace(/\s+/g, "-");
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function showMessage(element, text, success) {
    element.textContent = text;
    element.hidden = false;
    element.classList.toggle("success", Boolean(success));
  }

  function clearMessage(element) {
    element.textContent = "";
    element.hidden = true;
    element.classList.remove("success");
  }

  function clearNetValidation() {
    elements.netDate.classList.remove("is-invalid");
    elements.netControlCallsign.classList.remove("is-invalid");
    document.getElementById("net-control-station-group").classList.remove("is-invalid-group");
    document.getElementById("net-control-traffic-group").classList.remove("is-invalid-group");
  }

  function clearCheckInValidation() {
    elements.checkinCallsign.classList.remove("is-invalid");
    elements.checkinNote.classList.remove("is-invalid");
    document.getElementById("checkin-station-group").classList.remove("is-invalid-group");
    document.getElementById("checkin-traffic-group").classList.remove("is-invalid-group");
  }

  function focusFirstInvalid(form) {
    var invalid = form.querySelector(".is-invalid, .is-invalid-group input");
    if (invalid) {
      invalid.focus();
    }
  }

  function resetCheckInForm() {
    elements.checkinForm.reset();
    resetLookupTracker("checkIn", elements.checkinNameStatus);
    updateNoteCounter();
    clearCheckInValidation();
  }

  window.W8FYNetCheckin = {
    getState: function () {
      return JSON.parse(JSON.stringify(state));
    },
    isDatabaseReady: function () {
      return databaseReady;
    },
    sortCheckIns: sortCheckIns,
    calculateTotals: calculateTotals,
    generateFinalReport: generateFinalReport,
    lastNetIdKey: LAST_NET_ID_KEY
  };
}());
