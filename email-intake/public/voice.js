(function () {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  var statusEl = document.getElementById("voice-status");
  var transcriptEl = document.getElementById("transcript");
  var resultEl = document.getElementById("result");
  var btn = document.getElementById("start-listen");
  var stopSpeakBtn = document.getElementById("stop-speak");
  var apiKeyInput = document.getElementById("voice-api-key");

  var SESSION_KEY = "cheeky_voice_api_key";

  if (apiKeyInput) {
    try {
      var saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) apiKeyInput.value = saved;
    } catch (_) {}
    apiKeyInput.addEventListener("change", function () {
      try {
        sessionStorage.setItem(SESSION_KEY, apiKeyInput.value.trim());
      } catch (_) {}
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function summaryForSpeech(data) {
    if (data == null) return "No response.";
    if (typeof data === "string") return data.slice(0, 800);
    if (typeof data.message === "string" && data.message) return data.message.slice(0, 800);
    if (typeof data.error === "string" && data.error) return data.error.slice(0, 800);
    try {
      return JSON.stringify(data).slice(0, 800);
    } catch (_) {
      return "Done.";
    }
  }

  function speakResult(data) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var text = summaryForSpeech(data);
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  if (stopSpeakBtn) {
    stopSpeakBtn.addEventListener("click", function () {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    });
  }

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not available in this browser. Use Google Chrome.");
    if (btn) btn.disabled = true;
    return;
  }

  var recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  var listening = false;
  var finalBuffer = "";
  var lastError = "";

  recognition.onstart = function () {
    listening = true;
    lastError = "";
    setStatus("Listening...");
    finalBuffer = "";
    if (transcriptEl) transcriptEl.textContent = "";
  };

  recognition.onresult = function (event) {
    var interim = "";
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var r = event.results[i];
      if (r.isFinal) finalBuffer += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (transcriptEl) transcriptEl.textContent = (finalBuffer + interim).trim();
  };

  recognition.onerror = function (ev) {
    listening = false;
    lastError = (ev && ev.error) ? ev.error : "unknown";
    if (lastError !== "aborted") setStatus("Error: " + lastError);
    if (btn) btn.disabled = false;
  };

  recognition.onend = function () {
    listening = false;
    if (btn) btn.disabled = false;
    setStatus("");

    if (lastError === "aborted") {
      lastError = "";
      return;
    }
    lastError = "";

    var text = (transcriptEl && transcriptEl.textContent.trim()) || finalBuffer.trim();
    if (!text) {
      setStatus("No speech captured. Try again.");
      return;
    }

    sendCommand(text);
  };

  function sendCommand(command) {
    var key = apiKeyInput ? apiKeyInput.value.trim() : "";
    if (!key) {
      resultEl.textContent =
        "Set x-api-key above (same value as AI_API_KEY on the server).";
      setStatus("Missing API key.");
      return;
    }

    setStatus("Sending command…");
    resultEl.textContent = "";

    fetch("/api/ai/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({ command: command }),
    })
      .then(function (res) {
        return res.text().then(function (t) {
          var parsed = null;
          try {
            parsed = t ? JSON.parse(t) : null;
          } catch (_) {
            parsed = { raw: t };
          }
          return { ok: res.ok, status: res.status, body: parsed, raw: t };
        });
      })
      .then(function (out) {
        setStatus("");
        var display =
          typeof out.body === "object" && out.body !== null
            ? JSON.stringify(out.body, null, 2)
            : String(out.raw || "");
        resultEl.textContent = display || "(empty)";

        var toSpeak = out.body;
        if (!out.ok && toSpeak && typeof toSpeak === "object") {
          toSpeak = toSpeak.error || toSpeak.message || toSpeak;
        }
        speakResult(toSpeak);
      })
      .catch(function (err) {
        setStatus("");
        var msg = err && err.message ? err.message : String(err);
        resultEl.textContent = "Request failed: " + msg;
        speakResult({ error: "Request failed." });
      });
  }

  if (btn) {
    btn.addEventListener("click", function () {
      if (listening) return;
      try {
        btn.disabled = true;
        recognition.start();
      } catch (e) {
        btn.disabled = false;
        setStatus("Could not start: " + (e && e.message ? e.message : e));
      }
    });
  }
})();
