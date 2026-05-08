"use strict";

/**
 * CHEEKY OS v4.1 — Prometheus text exposition helpers.
 */

function escapePromLabel(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function prometheusLinesFromSnap(snap) {
  const v = escapePromLabel(String(snap?.version?.cheeky_os || "4.3"));
  const mu = typeof process.memoryUsage === "function" ? process.memoryUsage() : {};
  const heap = Number(mu.heapUsed || 0);
  const rss = Number(mu.rss || 0);

  const lines = [];
  lines.push(`# HELP cheeky_os_info Static build info`);
  lines.push(`# TYPE cheeky_os_info gauge`);
  lines.push(`cheeky_os_info{version="${v}"} 1`);

  lines.push(`# HELP cheeky_os_uptime_seconds Process uptime`);
  lines.push(`# TYPE cheeky_os_uptime_seconds gauge`);
  lines.push(`cheeky_os_uptime_seconds{version="${v}"} ${Number(snap?.uptimeSec || 0)}`);

  lines.push(`# HELP cheeky_os_intake_accepted_total Intake posts accepted`);
  lines.push(`# TYPE cheeky_os_intake_accepted_total counter`);
  lines.push(`cheeky_os_intake_accepted_total ${Number(snap?.intake?.acceptedCount || 0)}`);

  const w = snap?.worker || {};
  lines.push(`# HELP cheeky_os_worker_jobs_processed Worker jobs processed`);
  lines.push(`# TYPE cheeky_os_worker_jobs_processed counter`);
  lines.push(`cheeky_os_worker_jobs_processed ${Number(w.jobsProcessed || 0)}`);

  lines.push(`# HELP cheeky_os_worker_enabled Worker enabled`);
  lines.push(`# TYPE cheeky_os_worker_enabled gauge`);
  lines.push(`cheeky_os_worker_enabled ${w.enabled ? 1 : 0}`);

  lines.push(`# HELP cheeky_os_worker_running Worker timer running`);
  lines.push(`# TYPE cheeky_os_worker_running gauge`);
  lines.push(`cheeky_os_worker_running ${w.running ? 1 : 0}`);

  lines.push(`# HELP cheeky_os_worker_jobs_failed Worker jobs failed counter`);
  lines.push(`# TYPE cheeky_os_worker_jobs_failed counter`);
  lines.push(`cheeky_os_worker_jobs_failed ${Number(w.jobsFailed || 0)}`);

  lines.push(`# HELP cheeky_os_worker_crash_ticks Uncaught worker tick errors`);
  lines.push(`# TYPE cheeky_os_worker_crash_ticks counter`);
  lines.push(`cheeky_os_worker_crash_ticks ${Number(w.crashed || 0)}`);

  lines.push(`# HELP cheeky_os_queue_poll_success_total Successful queue polls`);
  lines.push(`# TYPE cheeky_os_queue_poll_success_total counter`);
  lines.push(`cheeky_os_queue_poll_success_total ${Number(w.ticksOk || 0)}`);

  lines.push(`# HELP cheeky_os_queue_poll_failure_total Failed queue polls`);
  lines.push(`# TYPE cheeky_os_queue_poll_failure_total counter`);
  lines.push(`cheeky_os_queue_poll_failure_total ${Number(w.ticksFailed || 0)}`);

  lines.push(`# HELP cheeky_os_breaker_open Circuit breaker cooldown active`);
  lines.push(`# TYPE cheeky_os_breaker_open gauge`);
  const bo = w.breakerOpenUntil && Date.now() < w.breakerOpenUntil ? 1 : 0;
  lines.push(`cheeky_os_breaker_open ${bo}`);

  lines.push(`# HELP cheeky_os_odata_failures_logged OData failure observations`);
  lines.push(`# TYPE cheeky_os_odata_failures_logged counter`);
  lines.push(`cheeky_os_odata_failures_logged ${Number(snap?.resiliency?.odataFailuresObserved || 0)}`);

  lines.push(`# HELP cheeky_os_http_retries_logged External HTTP retries`);
  lines.push(`# TYPE cheeky_os_http_retries_logged counter`);
  lines.push(`cheeky_os_http_retries_logged ${Number(snap?.resiliency?.externalHttpRetriesRecorded || 0)}`);

  lines.push(`# HELP cheeky_os_process_heap_bytes Node heapUsed`);
  lines.push(`# TYPE cheeky_os_process_heap_bytes gauge`);
  lines.push(`cheeky_os_process_heap_bytes{version="${v}"} ${heap}`);

  lines.push(`# HELP cheeky_os_process_rss_bytes Node RSS`);
  lines.push(`# TYPE cheeky_os_process_rss_bytes gauge`);
  lines.push(`cheeky_os_process_rss_bytes{version="${v}"} ${rss}`);

  lines.push(`# HELP cheeky_os_worker_stateless_mode CHEEKY_WORKER_STATELESS enabled`);
  lines.push(`# TYPE cheeky_os_worker_stateless_mode gauge`);
  lines.push(`cheeky_os_worker_stateless_mode ${snap?.scaling?.worker_stateless_hint ? 1 : 0}`);

  const qsnaps = snap?.operatorQueueRecent || [];
  if (qsnaps.length) {
    lines.push(`# HELP cheeky_os_queue_recent_depth Recent queue snapshot depths`);
    lines.push(`# TYPE cheeky_os_queue_recent_depth gauge`);
    for (let i = 0; i < Math.min(qsnaps.length, 12); i += 1) {
      const q = qsnaps[i];
      const idx = escapePromLabel(String(i));
      const okLbl = escapePromLabel(String(q && q.ok ? "1" : "0"));
      lines.push(
        `cheeky_os_queue_recent_depth{version="${v}",index="${idx}",ok="${okLbl}"} ${Number(q.depth || 0)}`
      );
    }
  }

  return lines.join("\n") + "\n";
}

module.exports = { prometheusLinesFromSnap };
