---
title: "W8FY Wavelog Jumpstart"
date: 2026-08-16
draft: false
description: "Quick access to the W8FY club Wavelog, contesting dashboard, radio connection instructions, and official Wavelog user documentation."
keywords: ["W8FY Wavelog", "Wavelog logbook", "WavelogGate", "amateur radio logging", "CAT control", "W8FY contesting", "Van Wert Amateur Radio Club"]
---

<section class="wavelog-hero">
  <div>
    <p class="wavelog-eyebrow">W8FY Logging Tools</p>
    <h2>Log contacts, follow contest activity, and get on the air.</h2>
    <p>Wavelog is the club's browser-based amateur radio logbook. Use this page as your starting point for everyday contacts and contest operations.</p>
    <div class="wavelog-actions">
      <a class="wavelog-button primary" href="https://log.n0sys.net/" target="_blank" rel="noopener">Open Club Wavelog <span aria-hidden="true">↗</span></a>
      <a class="wavelog-button secondary" href="https://log-dash.n0sys.net/" target="_blank" rel="noopener">Open Contesting Dashboard <span aria-hidden="true">↗</span></a>
    </div>
  </div>
  <div class="wavelog-radio-mark" aria-hidden="true">
    <span></span><span></span><span></span><span></span><span></span>
  </div>
</section>

<div class="wavelog-notice">
  <strong>Need access?</strong> Sign in with the account provided by the club. If you do not have an account or are unsure which station location to use, contact <a href="mailto:N0SYS@W8FY.ORG">N0SYS@W8FY.ORG</a> before entering contacts.
</div>

## Quick Start

<div class="wavelog-steps">
  <article>
    <span>1</span>
    <h3>Open the club log</h3>
    <p>Launch Wavelog and sign in. The first screen is the dashboard, with recent contacts, summary statistics, and the main navigation.</p>
  </article>
  <article>
    <span>2</span>
    <h3>Check your station</h3>
    <p>Before logging, confirm that the correct station location and callsign are active. This keeps contacts associated with the right operating setup.</p>
  </article>
  <article>
    <span>3</span>
    <h3>Choose a logging mode</h3>
    <p>Use <strong>Live QSO</strong> while operating, or <strong>Post QSO</strong> when entering a contact after it happened. Enter the callsign, band or frequency, mode, reports, and any useful notes.</p>
  </article>
  <article>
    <span>4</span>
    <h3>Review the contact</h3>
    <p>Open the Logbook to confirm the QSO was saved correctly. The logbook is also where contacts can be searched, reviewed, and edited.</p>
  </article>
</div>

## Choose Your Tool

<div class="wavelog-tool-grid">
  <article class="wavelog-tool-card">
    <p class="wavelog-card-label">Primary logbook</p>
    <h3>Club Wavelog</h3>
    <p>Enter and review QSOs, explore maps and statistics, import or export ADIF files, and manage normal station logging.</p>
    <a href="https://log.n0sys.net/" target="_blank" rel="noopener">Go to log.n0sys.net <span aria-hidden="true">↗</span></a>
  </article>
  <article class="wavelog-tool-card accent">
    <p class="wavelog-card-label">Contest operations</p>
    <h3>Contesting Dashboard</h3>
    <p>Open the club's dedicated contesting dashboard when you need the contest-focused view alongside Wavelog.</p>
    <a href="https://log-dash.n0sys.net/" target="_blank" rel="noopener">Go to log-dash.n0sys.net <span aria-hidden="true">↗</span></a>
  </article>
</div>

## Official Wavelog Documentation

Wavelog changes over time, so use the official documentation for detailed interface instructions and current feature behavior.

<div class="wavelog-doc-grid">
  <a href="https://docs.wavelog.org/" target="_blank" rel="noopener">
    <strong>Documentation Home</strong>
    <span>Start with the official Wavelog user and project documentation.</span>
  </a>
  <a href="https://docs.wavelog.org/user-guide/logbook/dashboard/" target="_blank" rel="noopener">
    <strong>Dashboard &amp; Navigation</strong>
    <span>Learn what appears after login and where the major tools are located.</span>
  </a>
  <a href="https://docs.wavelog.org/user-guide/logbook/logging/" target="_blank" rel="noopener">
    <strong>Logging Contacts</strong>
    <span>Understand Live QSO, Post QSO, data entry, and editing contacts.</span>
  </a>
  <a href="https://docs.wavelog.org/user-guide/logbook/logbook/" target="_blank" rel="noopener">
    <strong>Using the Logbook</strong>
    <span>Review the main logbook display and individual QSO actions.</span>
  </a>
  <a href="https://docs.wavelog.org/user-guide/logbook/adif-import-export/" target="_blank" rel="noopener">
    <strong>ADIF Import &amp; Export</strong>
    <span>Move contacts between Wavelog and other amateur radio software.</span>
  </a>
  <a href="https://docs.wavelog.org/user-guide/contesting/management/" target="_blank" rel="noopener">
    <strong>Contest Management</strong>
    <span>Create, start, review, and export Wavelog contest sessions.</span>
  </a>
</div>

## Connect Your Radio with WavelogGate

WavelogGate is a small desktop bridge that sends your radio's CAT data to Wavelog. Once connected, **Live QSO** can follow the radio's frequency and mode instead of requiring you to enter them by hand. WavelogGate is available for Windows, macOS, and Linux.

<div class="wavelog-notice">
  <strong>Before you begin:</strong> Connect the radio to your computer and confirm that CAT control works with either FLRig or Hamlib. You will also need your Wavelog API key and the station profile you use for logging.
</div>

<div class="wavelog-steps">
  <article>
    <span>1</span>
    <h3>Install WavelogGate</h3>
    <p>Download the current package for your operating system from the <a href="https://github.com/wavelog/WaveLogGate/releases/latest" target="_blank" rel="noopener">official WavelogGate release page</a>, then install or open the application.</p>
  </article>
  <article>
    <span>2</span>
    <h3>Connect to Wavelog</h3>
    <p>In WavelogGate, enter <strong>https://log.n0sys.net/<wbr></strong> as the Wavelog URL. Copy your API key from Wavelog's Settings page and paste it into the API Key field.</p>
  </article>
  <article>
    <span>3</span>
    <h3>Select your station</h3>
    <p>Refresh the Station list and choose the station profile that matches the callsign and operating location you will use. Give the radio a recognizable name, then save the profile.</p>
  </article>
  <article>
    <span>4</span>
    <h3>Add radio control</h3>
    <p>Choose the FLRig or Hamlib option that matches your CAT setup, enter its host and port, and save. Use WavelogGate's Test button, then check the Status tab for the live frequency and mode.</p>
  </article>
</div>

### Choose Your Radio-Control Method

<div class="wavelog-tool-grid">
  <article class="wavelog-tool-card">
    <p class="wavelog-card-label">Simple desktop setup</p>
    <h3>FLRig</h3>
    <p>Start FLRig first and make sure it can control the radio. In WavelogGate, select <strong>FLRig</strong> and use host <strong>127.0.0.1</strong> with port <strong>12345</strong>, unless you changed FLRig's XML-RPC settings.</p>
  </article>
  <article class="wavelog-tool-card accent">
    <p class="wavelog-card-label">Hamlib setup</p>
    <h3>Hamlib / rigctld</h3>
    <p>If <code>rigctld</code> is already running, select <strong>Hamlib</strong> and normally use host <strong>127.0.0.1</strong> with port <strong>4532</strong>. WavelogGate also offers Internal Hamlib; select your radio model, serial port, and the baud rate configured in the radio.</p>
  </article>
</div>

### Detailed Step-by-Step Setup

<ol class="waveloggate-directions">
  <li>
    <h4>Prepare the radio and computer</h4>
    <p>Connect the radio's CAT or USB cable and turn on the radio. Install the radio manufacturer's USB driver if your model requires one. Note the serial port name—such as <strong>COM3</strong> on Windows or <strong>/dev/cu.usbserial-…</strong> on macOS—and make sure the radio's CAT baud rate matches the rate you plan to use in the software.</p>
    <p>If another program already controls the radio, close it temporarily unless you know it can share the connection. Two programs generally cannot open the same serial port at the same time.</p>
  </li>
  <li>
    <h4>Download and start WavelogGate</h4>
    <p>Open the <a href="https://github.com/wavelog/WaveLogGate/releases/latest" target="_blank" rel="noopener">latest WavelogGate release</a> and choose the file for your computer. Windows users run the appropriate <strong>.exe</strong>; macOS users open the <strong>.dmg</strong> for Apple Silicon or Intel and move the app to Applications; Linux users install the package that matches their distribution.</p>
  </li>
  <li>
    <h4>Create a Wavelog API key</h4>
    <p>Sign in at <a href="https://log.n0sys.net/" target="_blank" rel="noopener">log.n0sys.net</a>. Open the API-key area from your Wavelog user menu or Settings and create a <strong>read/write</strong> key. Copy the key and keep it private—it gives software access to your Wavelog account.</p>
  </li>
  <li>
    <h4>Enter the club Wavelog settings</h4>
    <p>Open WavelogGate's <strong>Configuration</strong> tab and enter the following:</p>
    <ul>
      <li><strong>URL:</strong> https://log.n0sys.net/<wbr></li>
      <li><strong>API Key:</strong> the key created in the previous step</li>
      <li><strong>Station:</strong> press the refresh button, then choose the correct callsign and operating location</li>
      <li><strong>Radio name:</strong> enter a clear name such as <em>W8FY Shack Radio</em></li>
    </ul>
  </li>
  <li>
    <h4>Configure CAT control</h4>
    <p>Choose one radio-control method in WavelogGate:</p>
    <ul>
      <li><strong>FLRig:</strong> configure the radio in FLRig first and confirm its display follows the radio. In WavelogGate select FLRig, host <strong>127.0.0.1</strong>, and port <strong>12345</strong>.</li>
      <li><strong>External Hamlib:</strong> start <code>rigctld</code> for the correct radio and serial port. In WavelogGate select Hamlib, host <strong>127.0.0.1</strong>, and port <strong>4532</strong>.</li>
      <li><strong>Internal Hamlib:</strong> select Internal Hamlib, detect or install Hamlib when prompted, then choose the radio model, serial port, baud rate, parity, stop bits, and handshake settings that match the radio.</li>
    </ul>
    <p>Select <strong>Set MODE on QSY</strong> if you want a Wavelog tuning command to change both frequency and mode. Save the profile after making changes.</p>
  </li>
  <li>
    <h4>Verify the radio connection in WavelogGate</h4>
    <p>Open the <strong>Status</strong> tab. The TRX display should show the radio's current frequency and mode and update as you turn the tuning dial or change modes. Press <strong>Test</strong> to send a dry-run QSO and verify that WavelogGate can reach the club Wavelog without adding a normal contact to the log.</p>
  </li>
  <li>
    <h4>Verify the connection in Wavelog</h4>
    <p>Leave WavelogGate—and FLRig or external <code>rigctld</code>, if used—running. In Wavelog open <strong>QSO → Live QSO</strong>. If more than one radio is listed, select the radio name entered in WavelogGate. Tune the radio and confirm that Live QSO follows the frequency and mode.</p>
  </li>
  <li>
    <h4>Test Wavelog-to-radio tuning</h4>
    <p>With WavelogGate running, use a tuning or QSY action in Wavelog, such as selecting an available DX spot. Confirm the radio moves to the requested frequency. WavelogGate uses local port <strong>54321</strong> for QSY requests, so allow WavelogGate on your private network if the computer's firewall asks.</p>
  </li>
  <li>
    <h4>Operate and log</h4>
    <p>Keep WavelogGate open for the entire operating session. Confirm the frequency, mode, station profile, and callsign before saving the first contact. Frequency and mode can be filled from the radio, but the operator is still responsible for checking that every QSO is logged correctly.</p>
  </li>
</ol>

### Troubleshooting

| Problem | What to check |
|---|---|
| Station list is empty | Confirm the URL,  re-enter the API key, and press the station refresh button. |
| Test reports “wrong URL” | Use `https://log.n0sys.net/` exactly; a URL that returns a normal webpage instead of the API response will fail. |
| TRX display does not change | Confirm FLRig or `rigctld` can read the radio, then check the selected backend, serial port, CAT baud rate, host, and port. |
| Live QSO does not follow the radio | Keep WavelogGate running, open **Live QSO**, and select the WavelogGate radio name if a radio selector appears. |
| Wavelog will not tune the radio | Enable **Set MODE on QSY** if needed, check that port `54321` is not in use, and verify that firewall software is not blocking WavelogGate. |
| WavelogGate reports a port conflict | Close the other application using port `2333`, `54321`, or `54322`, then restart WavelogGate. |
| Duplicate QSOs appear | Make sure only one program is sending completed contacts to Wavelog. Do not have WavelogGate, GridTracker, and another logger all submit the same QSO. |

If you also send completed contacts from WSJT-X, FLDigi, or another logger, configure only one application to submit each QSO to Wavelog so duplicate contacts are not created. For digital-mode and advanced configuration, see the [official WavelogGate setup guide](https://github.com/wavelog/WaveLogGate#user-manual).

<p class="wavelog-footnote">The club Wavelog and contesting dashboard are separate services operated for W8FY members. The documentation links above lead to the official Wavelog project website.</p>
