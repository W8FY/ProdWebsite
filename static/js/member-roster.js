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
    officerGrid: document.getElementById("officerGrid")
  };

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

    if (member.arrl) {
      badges += '<span class="badge-roster badge-arrl">ARRL</span>';
    }

    if (member.officer) {
      badges += '<span class="badge-roster badge-officer">' + escapeHtml(member.officer) + '</span>';
    }

    return [
      '<article class="member-row' + (member.officer ? ' officer' : '') + '">',
      '<div>',
      '<div class="member-name">' + escapeHtml(member.name) + badges + '</div>',
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

  fetch("/data/member-roster.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Roster data could not be loaded.");
      }
      return response.json();
    })
    .then(function (payload) {
      members = (payload.members || []).slice().sort(function (a, b) {
        return String(a.lastName || a.name).localeCompare(String(b.lastName || b.name));
      });
      generatedAt = payload.generatedAt;
      render();
    })
    .catch(function () {
      els.updated.textContent = "Roster data is unavailable.";
      els.columns.innerHTML = '<p class="roster-loading">Roster data could not be loaded.</p>';
    });

  els.search.addEventListener("input", render);
}());
