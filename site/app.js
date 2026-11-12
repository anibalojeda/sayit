"use strict";

const textInput = document.querySelector("#text-input");
const charCount = document.querySelector("#char-count");
const voiceSelect = document.querySelector("#voice-select");
const voiceHint = document.querySelector("#voice-hint");
const pitchHint = document.querySelector("#pitch-hint");
const rate = document.querySelector("#rate");
const pitch = document.querySelector("#pitch");
const playButton = document.querySelector("#play-button");
const stopButton = document.querySelector("#stop-button");
const playLabel = document.querySelector("#play-label");
const playIcon = document.querySelector("#play-icon");
const playerTitle = document.querySelector("#player-title");
const playerStatus = document.querySelector("#player-status");
const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let state = "idle";
let activeMode = null;
let currentUtterance = null;
let audio = null;
let audioUrl = null;
let requestController = null;
let generation = 0;
let voices = [];

function isPolly() {
  return voiceSelect.value.startsWith("polly:");
}

function updateCount() {
  const limit = isPolly() ? 3000 : 10000;
  charCount.textContent = `${textInput.value.length.toLocaleString()} / ${limit.toLocaleString()} characters`;
}

function updateVoiceSettings() {
  const neural = isPolly();
  pitch.disabled = neural;
  voiceHint.textContent = neural
    ? "Neural voices send your text to Amazon Polly (3,000 characters maximum)."
    : "Device voices vary by browser and operating system.";
  pitchHint.textContent = neural ? "Pitch is available for device voices." : "Make it sound just right";
  updateCount();
}

function updatePlayer(title, message) {
  playerTitle.textContent = title;
  playerStatus.textContent = message;
  playLabel.textContent = state === "loading" ? "Generating…" : state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Listen now";
  playIcon.textContent = state === "playing" ? "Ⅱ" : "▶";
  playButton.disabled = state === "loading";
  stopButton.disabled = state === "idle";
}

function populateVoices() {
  const selected = voiceSelect.value || "polly:Matthew";
  voices = supported ? window.speechSynthesis.getVoices() : [];
  const neuralGroup = document.createElement("optgroup");
  neuralGroup.label = "Amazon Polly neural";
  neuralGroup.append(new Option("Joanna — English (US)", "polly:Joanna"), new Option("Matthew — English (US)", "polly:Matthew"));
  voiceSelect.replaceChildren(neuralGroup);
  if (supported) {
    const deviceGroup = document.createElement("optgroup");
    deviceGroup.label = "Device voices";
    deviceGroup.append(new Option("Default device voice", "device:"));
    for (const voice of voices) {
      deviceGroup.append(new Option(`${voice.name} (${voice.lang})${voice.default ? " — default" : ""}`, `device:${voice.voiceURI}`));
    }
    voiceSelect.append(deviceGroup);
  }
  if (Array.from(voiceSelect.options).some((option) => option.value === selected)) voiceSelect.value = selected;
  updateVoiceSettings();
}

function releaseAudio() {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio = null;
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

function stopPlayback(message = "Your words are waiting to be heard.") {
  generation += 1;
  if (requestController) requestController.abort();
  requestController = null;
  currentUtterance = null;
  if (supported && activeMode === "device") window.speechSynthesis.cancel();
  releaseAudio();
  activeMode = null;
  state = "idle";
  updatePlayer("Ready when you are", message);
}

function finishPlayback() {
  currentUtterance = null;
  releaseAudio();
  activeMode = null;
  state = "idle";
  updatePlayer("All done", "Press play to listen again.");
}

async function playPolly() {
  if (location.protocol === "file:") {
    updatePlayer("A Polly server is needed", "Use local_server.py or the deployed AWS site. Device voices work without a server.");
    return;
  }
  if (textInput.value.length > 3000) {
    updatePlayer("Text is too long", "Neural voices support up to 3,000 characters per request.");
    return;
  }
  const requestId = ++generation;
  requestController = new AbortController();
  activeMode = "polly";
  state = "loading";
  updatePlayer("Preparing your audio", "Sending text to Amazon Polly.");
  try {
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textInput.value, voice: voiceSelect.value.slice("polly:".length) }),
      signal: requestController.signal
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
      if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && (response.status === 404 || response.status === 501)) {
        throw new Error("This is a static server without Polly support. Start local_server.py instead.");
      }
      if (response.status === 502 && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
        throw new Error("Polly failed. Check the local server terminal for AWS credential, region, or permission errors.");
      }
      throw new Error(`Speech generation failed (HTTP ${response.status}). Please try again.`);
    }
    if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("audio/mpeg")) {
      throw new Error("The speech service returned an unexpected response.");
    }
    const blob = await response.blob();
    if (requestId !== generation) return;
    requestController = null;
    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.playbackRate = Number(rate.value);
    audio.onended = () => {
      if (requestId === generation) finishPlayback();
    };
    audio.onerror = () => {
      if (requestId !== generation) return;
      stopPlayback();
      updatePlayer("Playback failed", "Your browser couldn't play the generated audio.");
    };
    await audio.play();
    if (requestId !== generation) return;
    state = "playing";
    updatePlayer("Now playing", "Listening to your words.");
  } catch (error) {
    if (requestId !== generation || error.name === "AbortError") return;
    stopPlayback();
    updatePlayer("Playback couldn't start", error.message || "Please try again.");
  }
}

function playDevice() {
  if (!supported) {
    updatePlayer("Device speech isn't available", "Try a browser that supports text-to-speech.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(textInput.value);
  utterance.voice = voices.find((voice) => `device:${voice.voiceURI}` === voiceSelect.value) || null;
  utterance.rate = Number(rate.value);
  utterance.pitch = Number(pitch.value);
  currentUtterance = utterance;
  activeMode = "device";
  utterance.onend = () => {
    if (currentUtterance === utterance) finishPlayback();
  };
  utterance.onerror = (event) => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    activeMode = null;
    state = "idle";
    updatePlayer("Playback couldn't start", `Speech error: ${event.error}. Try another voice or browser.`);
  };
  state = "playing";
  updatePlayer("Now playing", "Listening to your words.");
  window.speechSynthesis.speak(utterance);
}

textInput.addEventListener("input", updateCount);
voiceSelect.addEventListener("change", updateVoiceSettings);
document.querySelector("#clear-button").addEventListener("click", () => {
  if (state !== "idle") stopPlayback();
  textInput.value = "";
  updateCount();
  textInput.focus();
});
document.querySelector("#sample-button").addEventListener("click", () => {
  if (state !== "idle") stopPlayback();
  textInput.value = "Take a moment. Breathe in, breathe out, and let the noise of the day fade into the background. There's no rush to be anywhere else. Right here is a pretty good place to start.";
  updateCount();
  textInput.focus();
});
for (const control of [rate, pitch]) {
  control.addEventListener("input", () => {
    document.querySelector(`#${control.id}-value`).textContent = `${Number(control.value).toFixed(1)}${control === rate ? "×" : ""}`;
  });
}
playButton.addEventListener("click", async () => {
  if (state === "playing") {
    if (activeMode === "polly") audio.pause();
    else window.speechSynthesis.pause();
    state = "paused";
    updatePlayer("Taking a little pause", "Resume whenever you're ready.");
    return;
  }
  if (state === "paused") {
    if (activeMode === "polly") {
      const requestId = generation;
      try {
        await audio.play();
      } catch (error) {
        if (requestId !== generation) return;
        stopPlayback();
        updatePlayer("Playback couldn't resume", error.message || "Please try again.");
        return;
      }
      if (requestId !== generation) return;
    } else {
      window.speechSynthesis.resume();
    }
    state = "playing";
    updatePlayer("Now playing", "Listening to your words.");
    return;
  }
  if (!textInput.value.trim()) {
    updatePlayer("Add some text first", "Type or paste something above to start listening.");
    textInput.focus();
    return;
  }
  if (isPolly()) await playPolly();
  else playDevice();
});
stopButton.addEventListener("click", () => stopPlayback("Playback stopped."));
populateVoices();
if (supported) window.speechSynthesis.addEventListener("voiceschanged", populateVoices);
