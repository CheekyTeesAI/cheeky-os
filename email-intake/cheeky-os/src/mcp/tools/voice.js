"use strict";

async function callVoiceEndpoint(url, command) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: command }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    body = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data: body,
  };
}

async function runVoiceCommand(input) {
  try {
    const command = input && typeof input.command === "string" ? input.command.trim() : "";
    if (!command) {
      return { error: true, message: 'Missing required field "command".' };
    }

    const primary = await callVoiceEndpoint("http://localhost:3000/voice/run", command);
    if (primary.ok) {
      return { error: false, data: primary };
    }

    const fallback = await callVoiceEndpoint("http://localhost:3000/cheeky/voice/run", command);
    if (fallback.ok) {
      return { error: false, data: fallback };
    }

    return {
      error: true,
      message: `Voice endpoint failed: primary ${primary.status}, fallback ${fallback.status}`,
      data: { primary, fallback },
    };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  runVoiceCommand,
};
