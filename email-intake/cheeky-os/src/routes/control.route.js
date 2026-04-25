"use strict";

const express = require("express");
const router = express.Router();

router.get("/control", async (_req, res) => {
  res.send(`
  <html>
  <head>
    <title>Cheeky OS Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      body { font-family: Arial; background: #111; color: #fff; padding: 15px; }
      h1 { margin-bottom: 10px; }
      .card { background: #1e1e1e; padding: 12px; margin-bottom: 12px; border-radius: 10px; }
      .btn { padding: 10px; margin: 5px 0; width: 100%; background: #333; color: #fff; border: none; border-radius: 6px; }
      .input { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: none; }
      .small { font-size: 12px; color: #aaa; }
    </style>
  </head>
  <body>

    <h1>Cheeky Control</h1>

    <input id="cmd" class="input" placeholder="Type command..." />
    <button class="btn" onclick="runCommand()">Run Command</button>
    <button class="btn" onclick="startVoice()">🎤 Speak Command</button>

    <div id="response" class="card">Waiting...</div>

    <div class="card">
      <button class="btn" onclick="quick('what should I do right now')">🔥 What should I do?</button>
      <button class="btn" onclick="quick('what needs printing today')">🖨️ Print Queue</button>
      <button class="btn" onclick="quick('what is behind')">⚠️ Problems</button>
      <button class="btn" onclick="quick('where is my money')">💰 Sales</button>
    </div>

    <div class="card">
      <button class="btn" onclick="quick('pending approvals')">🛡️ Pending Approvals</button>
      <button class="btn" onclick="quick('show unpaid deposits')">💵 Unpaid Deposits</button>
      <button class="btn" onclick="quick('show payments')">💳 Payment Status</button>
      <button class="btn" onclick="quick('show release queue')">🚦 Release Queue</button>
      <button class="btn" onclick="quick('what is blocked')">🧱 What Is Blocked</button>
      <button class="btn" onclick="quick('show vendor drafts')">📦 Vendor Drafts</button>
    </div>

    <div id="dashboard" class="card">Loading...</div>

    <script>
      async function loadDashboard() {
        try {
          const res = await fetch('/api/operator/summary');
          const data = await res.json();

          let html = '';

          // PRIORITIES
          html += '<b>Priorities</b><br>';
          (data.priorities || []).forEach(p => {
            html += '🔥 ' + p.message + '<br>';
          });

          html += '<br><b>Alerts</b><br>';
          (data.alerts || []).forEach(a => {
            html += '⚠️ ' + a.message + '<br>';
          });

          html += '<br><b>Sales</b><br>';
          (((data || {}).sales || {}).actions || []).forEach(a => {
            html += '💰 ' + a.message + '<br>';
          });

          document.getElementById('dashboard').innerHTML = html;

        } catch (e) {
          document.getElementById('dashboard').innerHTML = 'Error loading data';
        }
      }

      async function runCommand() {
        const cmd = document.getElementById('cmd').value;

        const res = await fetch('/api/ai/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });

        const data = await res.json();

        document.getElementById('response').innerText = JSON.stringify(data, null, 2);

        // OPTIONAL SPEAK BACK
        if (data.message) {
          speak(data.message);
        }
      }

      function startVoice() {
        try {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

          if (!SpeechRecognition) {
            alert('Voice not supported on this device');
            return;
          }

          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.start();

          recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;

            document.getElementById('cmd').value = transcript;
            runCommand();
          };

          recognition.onerror = function(err) {
            console.log('[VOICE ERROR]', err);
          };

        } catch (e) {
          console.log('[VOICE FAIL]', e);
        }
      }

      function speak(text) {
        try {
          if (!("speechSynthesis" in window) || !text) return;
          const msg = new SpeechSynthesisUtterance(text);
          window.speechSynthesis.speak(msg);
        } catch (_e) {}
      }

      function quick(text) {
        document.getElementById('cmd').value = text;
        runCommand();
      }

      loadDashboard();
      setInterval(loadDashboard, 10000);
    </script>

  </body>
  </html>
  `);
});

module.exports = router;
