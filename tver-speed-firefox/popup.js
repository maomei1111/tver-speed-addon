(function () {
  "use strict";

  var browserApi = globalThis.browser ?? globalThis.chrome;

  var SPEEDS = [0.5, 1, 1.25, 1.5, 2, 3, 4];
  var DEFAULT_SETTINGS = { speed: 1.0, autoApply: true, enabled: true };

  var speedButtonsEl = document.getElementById("speedButtons");
  var currentSpeedEl = document.getElementById("currentSpeed");
  var autoApplyEl = document.getElementById("autoApply");
  var enabledEl = document.getElementById("enabled");
  var unsupportedEl = document.getElementById("unsupported");

  var storageAvailable = !!(browserApi && browserApi.storage && browserApi.storage.local);
  var settings = Object.assign({}, DEFAULT_SETTINGS);

  function formatSpeedLabel(speed) {
    var n = Number(speed);
    return (n % 1 === 0 ? n.toFixed(0) : String(n)) + "x";
  }

  function storageGet(defaults) {
    try {
      var maybePromise = browserApi.storage.local.get(defaults);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise.catch(function () {
          return Object.assign({}, defaults);
        });
      }
      return new Promise(function (resolve) {
        browserApi.storage.local.get(defaults, function (result) {
          resolve(result || Object.assign({}, defaults));
        });
      });
    } catch (e) {
      return Promise.resolve(Object.assign({}, defaults));
    }
  }

  function storageSet(partial) {
    if (!storageAvailable) return;
    try {
      var maybePromise = browserApi.storage.local.set(partial);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(function () {});
      }
    } catch (e) {
      // 保存できない環境ではメモリ上の設定のみで動作する
    }
  }

  // 開いているTVerタブへ設定変更を即時通知する
  function notifyActiveTab(message) {
    if (!browserApi || !browserApi.tabs) return;
    try {
      var maybePromise = browserApi.tabs.query({ active: true, currentWindow: true });
      var handleTabs = function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || !tab.id) return;
        try {
          var sendResult = browserApi.tabs.sendMessage(tab.id, message);
          if (sendResult && typeof sendResult.catch === "function") {
            sendResult.catch(function () {
              // TVer以外のタブ、またはcontent script未読み込み時は無視する
            });
          }
        } catch (e) {
          // content scriptが存在しないタブへの送信エラーは無視する
        }
      };
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(handleTabs).catch(function () {});
      } else {
        browserApi.tabs.query({ active: true, currentWindow: true }, handleTabs);
      }
    } catch (e) {
      // tabs API非対応環境では無視する
    }
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
        storageSet({ speed: speed });
        notifyActiveTab({ type: "SET_SPEED", speed: speed });
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

  function init() {
    if (!storageAvailable) {
      unsupportedEl.classList.remove("hidden");
      settings = Object.assign({}, DEFAULT_SETTINGS);
      render();
      return;
    }

    storageGet(DEFAULT_SETTINGS).then(function (result) {
      settings = Object.assign({}, DEFAULT_SETTINGS, result);
      render();
    });

    autoApplyEl.addEventListener("change", function () {
      settings.autoApply = autoApplyEl.checked;
      storageSet({ autoApply: settings.autoApply });
      notifyActiveTab({ type: "SET_AUTO_APPLY", autoApply: settings.autoApply });
    });

    enabledEl.addEventListener("change", function () {
      settings.enabled = enabledEl.checked;
      storageSet({ enabled: settings.enabled });
      notifyActiveTab({ type: "SET_ENABLED", enabled: settings.enabled });
    });
  }

  init();
})();
