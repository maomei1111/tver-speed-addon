(function () {
  "use strict";

  var SPEEDS = [0.5, 1, 1.25, 1.5, 2, 3, 4];
  var DEFAULT_SETTINGS = { speed: 1.0, autoApply: true, enabled: true };

  var speedButtonsEl = document.getElementById("speedButtons");
  var currentSpeedEl = document.getElementById("currentSpeed");
  var autoApplyEl = document.getElementById("autoApply");
  var enabledEl = document.getElementById("enabled");
  var unsupportedEl = document.getElementById("unsupported");

  var storageAvailable = hasStorage();
  var settings = Object.assign({}, DEFAULT_SETTINGS);

  function hasStorage() {
    try {
      return !!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
  }

  function formatSpeedLabel(speed) {
    var n = Number(speed);
    return (n % 1 === 0 ? n.toFixed(0) : String(n)) + "x";
  }

  function renderSpeedButtons() {
    speedButtonsEl.innerHTML = "";
    SPEEDS.forEach(function (speed) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = formatSpeedLabel(speed);
      btn.className = settings.speed === speed ? "active" : "";
      btn.addEventListener("click", function () {
        settings.speed = speed;
        persist({ speed: speed });
        render();
      });
      speedButtonsEl.appendChild(btn);
    });
  }

  function render() {
    renderSpeedButtons();
    currentSpeedEl.textContent = formatSpeedLabel(settings.speed);
    autoApplyEl.checked = !!settings.autoApply;
    enabledEl.checked = !!settings.enabled;
  }

  function persist(partial) {
    settings = Object.assign({}, settings, partial);
    if (!storageAvailable) return;
    try {
      chrome.storage.local.set(partial);
    } catch (e) {
      // 保存できない環境ではメモリ上の設定のみで動作する
    }
  }

  function init() {
    if (!storageAvailable) {
      unsupportedEl.classList.remove("hidden");
      settings = Object.assign({}, DEFAULT_SETTINGS);
      render();
      return;
    }

    chrome.storage.local.get(DEFAULT_SETTINGS, function (result) {
      settings = Object.assign({}, DEFAULT_SETTINGS, result);
      render();
    });

    autoApplyEl.addEventListener("change", function () {
      persist({ autoApply: autoApplyEl.checked });
    });

    enabledEl.addEventListener("change", function () {
      persist({ enabled: enabledEl.checked });
    });
  }

  init();
})();
