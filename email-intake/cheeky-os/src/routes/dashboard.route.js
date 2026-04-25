"use strict";

const express = require("express");
const router = express.Router();

router.get("/dashboard", async (_req, res) => {
  res.send(`
  <html>
  <head>
    <title>Cheeky OS Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: Arial; background: #111; color: #fff; padding: 20px; }
      h1 { margin-bottom: 10px; }
      .card { background: #1e1e1e; padding: 15px; margin-bottom: 15px; border-radius: 10px; }
      .alert { background: #b00020; padding: 10px; margin-bottom: 10px; border-radius: 6px; }
      .metric { font-size: 24px; font-weight: bold; }
      .label { color: #aaa; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Cheeky OS</h1>
    <div id="content">Loading...</div>

    <script>
      async function load() {
        try {
          const r = await fetch('/api/operator/summary');
          const data = await r.json();

          let html = '';

          // MONEY CARD
          html += '<div class="card">';
          html += '<div style="font-size:20px;">💰 ' + ((((data || {}).money || {}).message) || '') + '</div>';
          html += '</div>';

          // METRICS
          html += '<div class="card">';
          html += '<div class="metric">' + ((data.metrics && data.metrics.ordersToday) || 0) + '</div>';
          html += '<div class="label">Orders Today</div>';
          html += '</div>';

          html += '<div class="card">';
          html += '<div class="metric">' + ((data.metrics && data.metrics.openTasks) || 0) + '</div>';
          html += '<div class="label">Open Tasks</div>';
          html += '</div>';

          // ALERTS
          if (data.alerts && data.alerts.length) {
            data.alerts.forEach(function(a) {
              html += '<div class="alert">' + a.message + '</div>';
            });
          }

          // PRIORITIES
          html += '<div class="card"><b>Priority</b><br>';
          (data.priorities || []).forEach(function(p) {
            html += '<div>🔥 ' + p.message + '</div>';
          });
          html += '</div>';

          // TOP OPPORTUNITIES
          html += '<div class="card"><b>Top Opportunities</b><br>';
          ((((data || {}).sales || {}).actions) || []).forEach(function(a) {
            html += '<div>💰 [' + (a.priority || 'LOW') + '] ' + a.message + '</div>';
          });
          html += '</div>';

          // PIPELINE
          html += '<div class="card"><b>Pipeline</b><br>';
          ((((data || {}).pipeline || {}).leads) || []).forEach(function(l) {
            html += '<div>🆕 ' + (l.name || 'Lead') + '</div>';
          });
          html += '</div>';

          // PRINTING QUEUE
          html += '<div class="card"><b>Printing</b><br>';
          ((data.queues && data.queues.printing) || []).forEach(function(t) {
            html += '<div>' + (t.title || t.id || 'Task') + '</div>';
          });
          html += '</div>';

          // PRODUCTION READY
          html += '<div class="card"><b>Production Ready</b><br>';
          ((data.queues && data.queues.productionReady) || []).forEach(function(t) {
            html += '<div>' + (t.title || t.id || 'Task') + '</div>';
          });
          html += '</div>';

          document.getElementById('content').innerHTML = html;
        } catch (_e) {
          document.getElementById('content').innerHTML = 'Error loading dashboard';
        }
      }

      load();
      setInterval(load, 10000);
    </script>
  </body>
  </html>
  `);
});

module.exports = router;
