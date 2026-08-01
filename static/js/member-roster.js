(function () {
  var members = [];
  var generatedAt = null;

  var els = {
    search: document.getElementById("memberSearch"),
    paidCount: document.getElementById("paidCount"),
    unpaidCount: document.getElementById("unpaidCount"),
    totalCount: document.getElementById("totalCount"),
    percent: document.getElementById("currentPercent"),
    updated: document.getElementById("updatedLine"),
    columns: document.getElementById("rosterColumns"),
    officerSection: document.getElementById("officerSection"),
    officerGrid: document.getElementById("officerGrid"),
    duesCallsign: document.getElementById("duesCallsign"),
    yearsSelect: document.getElementById("yearsSelect"),
    cashappLink: document.getElementById("cashappLink"),
    paypalForm: document.querySelector(".dues-paypal-form"),
    paypalAmount: document.getElementById("paypalAmount"),
    paypalButton: document.getElementById("paypalButton"),
    paypalCallsign: document.getElementById("paypalCallsign"),
    paypalCustom: document.getElementById("paypalCustom"),
    paypalItemNumber: document.getElementById("paypalItemNumber")
  };

  var DUES_PER_YEAR = 10;
  var PROCESSING_FEE = 1;

  function normalizeMember(member) {
    var paidThrough = member.paidThrough;
    if (paidThrough === undefined) {
      paidThrough = member.paid_through;
    }
    if (paidThrough === undefined) {
      paidThrough = member.duesYear;
    }
    if (paidThrough === undefined) {
      paidThrough = member.dues_year;
    }

    var normalizedPaidThrough = paidThrough === null || paidThrough === undefined || paidThrough === "" ? null : Number(paidThrough);
    if (!Number.isFinite(normalizedPaidThrough)) {
      normalizedPaidThrough = null;
    }

    return {
      name: member.name || "",
      lastName: member.lastName || member.last_name || member.name || "",
      call: member.call || member.callSign || member.call_sign || "",
      paidThrough: normalizedPaidThrough,
      paid: member.paid,
      arrl: Boolean(member.arrl !== undefined ? member.arrl : member.arrl_member),
      ema: Boolean(member.ema !== undefined ? member.ema : member.ema_association),
      races: Boolean(member.races !== undefined ? member.races : member.races_member),
      officer: member.officer || member.position || "",
      officerRank: Number(member.officerRank || member.officer_rank || 9999),
      cardUrl: member.cardUrl || member.card_url || ""
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isPaid(member) {
    var year = Number(member.paidThrough || 0);
    if (!year && typeof member.paid === "boolean") {
      return member.paid;
    }

    return year >= new Date().getFullYear();
  }

  function matches(member, query) {
    if (!query) {
      return true;
    }

    var haystack = [
      member.name,
      member.lastName,
      member.call,
      member.ema ? "ema emergency management association" : "",
      member.races ? "races radio amateur civil emergency service" : "",
      member.officer
    ].join(" ").toLowerCase();

    return haystack.indexOf(query) !== -1;
  }

  function renderStats(activeMembers) {
    var paid = activeMembers.filter(isPaid).length;
    var total = activeMembers.length;
    var unpaid = total - paid;
    var pct = total ? Math.round((paid / total) * 100) : 0;
    var gauge = document.querySelector(".summary-gauge");

    els.paidCount.textContent = paid;
    els.unpaidCount.textContent = unpaid;
    els.totalCount.textContent = total;
    els.percent.textContent = pct + "%";
    if (gauge) {
      gauge.style.setProperty("--pct", pct);
    }
  }

  function renderOfficers(activeMembers) {
    var officers = activeMembers.filter(function (member) {
      return member.officer && String(member.officer).trim();
    }).sort(function (a, b) {
      if (a.officerRank !== b.officerRank) {
        return a.officerRank - b.officerRank;
      }
      return String(a.name).localeCompare(String(b.name));
    });

    if (!officers.length) {
      els.officerSection.hidden = true;
      els.officerGrid.innerHTML = "";
      return;
    }

    els.officerSection.hidden = false;
    els.officerGrid.innerHTML = officers.map(function (member) {
      return [
        '<article class="officer-card">',
        '<div class="officer-role">' + escapeHtml(member.officer) + '</div>',
        '<div class="officer-name">' + escapeHtml(member.name) + '</div>',
        '<div class="officer-call">' + escapeHtml(member.call) + '</div>',
        '</article>'
      ].join("");
    }).join("");
  }

  function memberRow(member) {
    var paid = isPaid(member);
    var badges = "";
    var right = paid && member.paidThrough ? "thru " + escapeHtml(member.paidThrough) : "dues open";
    var name = escapeHtml(member.name);

    if (paid && member.cardUrl) {
      name = '<a class="member-card-link" href="' + escapeHtml(member.cardUrl) + '" download title="Download membership card">' + name + '</a>';
    }

    if (member.arrl) {
      badges += '<span class="badge-roster badge-arrl">ARRL</span>';
    }

    if (member.ema) {
      badges += '<span class="badge-roster badge-ema">EMA</span>';
    }

    if (member.races) {
      badges += '<span class="badge-roster badge-races">RACES</span>';
    }

    if (member.officer) {
      badges += '<span class="badge-roster badge-officer">' + escapeHtml(member.officer) + '</span>';
    }

    return [
      '<article class="member-row' + (member.officer ? ' officer' : '') + '">',
      '<div>',
      '<div class="member-name">' + name + badges + '</div>',
      '<div class="member-meta">' + escapeHtml(member.call) + '</div>',
      '</div>',
      '<div class="member-right">' + right + '</div>',
      '</article>'
    ].join("");
  }

  function renderColumn(title, className, list) {
    return [
      '<div class="roster-column ' + className + '">',
      '<h2>' + title + ' <span>(' + list.length + ')</span></h2>',
      list.length ? '<div class="member-list">' + list.map(memberRow).join("") + '</div>' : '<p class="empty-column">No matching members.</p>',
      '</div>'
    ].join("");
  }

  function render() {
    var query = (els.search.value || "").trim().toLowerCase();
    var activeMembers = members.filter(function (member) {
      return matches(member, query);
    });
    var paid = activeMembers.filter(isPaid);
    var unpaid = activeMembers.filter(function (member) {
      return !isPaid(member);
    });

    renderStats(activeMembers);
    renderOfficers(activeMembers);
    els.columns.innerHTML = renderColumn("Open Dues", "unpaid", unpaid) + renderColumn("Paid Members", "paid", paid);

    if (generatedAt) {
      els.updated.textContent = "Roster generated " + new Date(generatedAt).toLocaleString();
    }
  }

  function updatePaymentLinks() {
    if (!els.yearsSelect || !els.cashappLink || !els.paypalAmount || !els.paypalButton) {
      return;
    }

    var years = parseInt(els.yearsSelect.value, 10) || 1;
    var amount = (years * DUES_PER_YEAR + PROCESSING_FEE).toFixed(2);
    var callsign = els.duesCallsign ? els.duesCallsign.value.trim().toUpperCase() : "";
    var paymentNote = callsign ? "Call sign: " + callsign : "";

    els.cashappLink.href = "https://cash.app/$drfziggy/" + amount + (paymentNote ? "?note=" + encodeURIComponent(paymentNote) : "");
    els.cashappLink.textContent = "Cash App - $" + amount;
    els.paypalAmount.value = amount;
    els.paypalButton.textContent = "PayPal - $" + amount;

    if (els.paypalCallsign) {
      els.paypalCallsign.value = callsign;
    }
    if (els.paypalCustom) {
      els.paypalCustom.value = paymentNote;
    }
    if (els.paypalItemNumber) {
      els.paypalItemNumber.value = callsign;
    }
  }

  function copyCashAppNote() {
    var callsign = els.duesCallsign ? els.duesCallsign.value.trim().toUpperCase() : "";

    if (!callsign || !navigator.clipboard || !navigator.clipboard.writeText) {
      return;
    }

    navigator.clipboard.writeText("Call sign: " + callsign).catch(function () {});
  }

  fetch("/data/member-roster.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Roster data could not be loaded.");
      }
      return response.json();
    })
    .then(function (payload) {
      members = (payload.members || []).map(normalizeMember).sort(function (a, b) {
        return String(a.lastName || a.name).localeCompare(String(b.lastName || b.name));
      });
      generatedAt = payload.generatedAt || payload.generated_at;
      render();
    })
    .catch(function () {
      els.updated.textContent = "Roster data is unavailable.";
      els.columns.innerHTML = '<p class="roster-loading">Roster data could not be loaded.</p>';
    });

  els.search.addEventListener("input", render);
  if (els.yearsSelect) {
    els.yearsSelect.addEventListener("change", updatePaymentLinks);
    updatePaymentLinks();
  }
  if (els.duesCallsign) {
    els.duesCallsign.addEventListener("input", updatePaymentLinks);
  }
  if (els.cashappLink) {
    els.cashappLink.addEventListener("click", copyCashAppNote);
  }
  if (els.paypalForm) {
    els.paypalForm.addEventListener("submit", updatePaymentLinks);
  }
}());
