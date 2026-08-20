(function () {
  "use strict";

  var browserApi = globalThis.browser ?? globalThis.chrome;

  var SPEEDS = [1.25, 1.5, 2, 2.5, 3, 3.5, 4];
  var DEFAULT_SETTINGS = { speed: 1.0, autoApply: true, enabled: true };
  var PANEL_ID = "tver-speed-addon-panel";
  var REAPPLY_EVENTS = ["loadedmetadata", "play", "playing", "ratechange"];
  var POLL_INTERVAL_MS = 1500;
  var RETRY_DELAY_MS = 200;
  var MAX_RETRY = 3;

  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var trackedVideos = new WeakSet();
  var panelEl = null;
  var storageAvailable = !!(browserApi && browserApi.storage && browserApi.storage.local);

  // --- 設定の読み込み・保存（Promise/callback両対応） -----------------------

  function storageGet(defaults) {
    if (!storageAvailable) return Promise.resolve(Object.assign({}, defaults));
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
      // storage未対応・保存失敗時はメモリ上の設定のみで動作する
    }
  }

  function loadSettings() {
    return storageGet(DEFAULT_SETTINGS).then(function (result) {
      settings = Object.assign({}, DEFAULT_SETTINGS, result);
    });
  }

  function saveSettings(partial) {
    settings = Object.assign({}, settings, partial);
    storageSet(partial);
  }

  if (storageAvailable && browserApi.storage.onChanged) {
    try {
      browserApi.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local") return;
        var next = Object.assign({}, settings);
        var changed = false;
        if (changes.speed) {
          next.speed = changes.speed.newValue;
          changed = true;
        }
        if (changes.autoApply) {
          next.autoApply = changes.autoApply.newValue;
          changed = true;
        }
        if (changes.enabled) {
          next.enabled = changes.enabled.newValue;
          changed = true;
        }
        if (changed) {
          settings = next;
          onSettingsUpdated();
        }
      });
    } catch (e) {
      // onChanged非対応環境では無視する
    }
  }

  // ポップアップからの設定変更通知（tabs.sendMessage）を受け取る
  if (browserApi && browserApi.runtime && browserApi.runtime.onMessage) {
    try {
      browserApi.runtime.onMessage.addListener(function (message) {
        if (!message || typeof message !== "object") return;
        if (message.type === "SET_SPEED" && Number.isFinite(message.speed)) {
          settings = Object.assign({}, settings, { speed: message.speed });
        } else if (message.type === "SET_AUTO_APPLY") {
          settings = Object.assign({}, settings, { autoApply: !!message.autoApply });
        } else if (message.type === "SET_ENABLED") {
          settings = Object.assign({}, settings, { enabled: !!message.enabled });
        } else {
          return;
        }
        onSettingsUpdated();
      });
    } catch (e) {
      // onMessage非対応環境では無視する
    }
  }

  function onSettingsUpdated() {
    renderPanel();
    if (!settings.enabled || !settings.autoApply) return;
    getAllVideos().forEach(function (video) {
      applySpeed(video, settings.speed);
    });
  }

  // --- video要素の検出・監視 -------------------------------------------------

  function getAllVideos() {
    return Array.prototype.slice.call(document.querySelectorAll("video"));
  }

  function applySpeed(video, speed, attempt) {
    attempt = attempt || 0;
    if (!(video instanceof HTMLVideoElement)) return;
    if (!Number.isFinite(speed)) return;
    try {
      if (video.playbackRate !== speed) {
        video.playbackRate = speed;
      }
      if (video.playbackRate !== speed && attempt < MAX_RETRY) {
        setTimeout(function () {
          applySpeed(video, speed, attempt + 1);
        }, RETRY_DELAY_MS);
      }
    } catch (e) {
      if (attempt < MAX_RETRY) {
        setTimeout(function () {
          applySpeed(video, speed, attempt + 1);
        }, RETRY_DELAY_MS);
      }
    }
  }

  function bindVideo(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);

    var reapply = function () {
      if (!settings.enabled || !settings.autoApply) return;
      if (video.playbackRate !== settings.speed) {
        applySpeed(video, settings.speed);
      }
    };

    REAPPLY_EVENTS.forEach(function (evt) {
      video.addEventListener(evt, reapply);
    });

    if (settings.enabled && settings.autoApply) {
      applySpeed(video, settings.speed);
    }
  }

  function scanVideos() {
    getAllVideos().forEach(bindVideo);
  }

  function startObservers() {
    if (typeof MutationObserver === "undefined") return;
    var target = document.documentElement || document.body;
    if (!target) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          scanVideos();
          break;
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function startPolling() {
    // TVerはSPAで画面遷移や広告/本編切り替えが起きるため、短時間の再試行としてポーリングも併用する
    setInterval(function () {
      scanVideos();
      if (!settings.enabled || !settings.autoApply) return;
      getAllVideos().forEach(function (video) {
        if (video.playbackRate !== settings.speed) {
          applySpeed(video, settings.speed);
        }
      });
    }, POLL_INTERVAL_MS);
  }

  // --- 速度パネルUI（TVerのDOMクラス名に依存しない独自クラス名を使用） --------

  function ensurePanelRoot() {
    if (!document.body) return null;
    var el = document.getElementById(PANEL_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = PANEL_ID;
    document.body.appendChild(el);
    return el;
  }

  function formatSpeedLabel(speed) {
    var n = Number(speed);
    return (n % 1 === 0 ? n.toFixed(0) : String(n)) + "x";
  }

  function renderPanel() {
    if (!settings.enabled) {
      if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.removeChild(panelEl);
      }
      panelEl = null;
      return;
    }

    var root = ensurePanelRoot();
    if (!root) return;
    panelEl = root;

    if (panelEl.dataset.collapsed === undefined) {
      panelEl.dataset.collapsed = "false";
    }

    panelEl.innerHTML = "";
    panelEl.className =
      panelEl.dataset.collapsed === "true"
        ? "tver-speed-addon-panel collapsed"
        : "tver-speed-addon-panel";

    var header = document.createElement("div");
    header.className = "tver-speed-addon-header";

    var title = document.createElement("span");
    title.className = "tver-speed-addon-title";
    title.textContent = "再生速度";
    header.appendChild(title);

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "tver-speed-addon-collapse";
    toggleBtn.textContent = panelEl.dataset.collapsed === "true" ? "＋" : "－";
    toggleBtn.setAttribute("aria-label", "パネルの表示切り替え");
    toggleBtn.addEventListener("click", function () {
      panelEl.dataset.collapsed = panelEl.dataset.collapsed === "true" ? "false" : "true";
      renderPanel();
    });
    header.appendChild(toggleBtn);

    panelEl.appendChild(header);

    if (panelEl.dataset.collapsed === "true") {
      return;
    }

    var buttonRow = document.createElement("div");
    buttonRow.className = "tver-speed-addon-buttons";

    SPEEDS.forEach(function (speed) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tver-speed-addon-button" + (settings.speed === speed ? " active" : "");
      btn.textContent = formatSpeedLabel(speed);
      btn.addEventListener("click", function () {
        saveSettings({ speed: speed });
        getAllVideos().forEach(function (video) {
          applySpeed(video, speed);
        });
        renderPanel();
      });
      buttonRow.appendChild(btn);
    });

    panelEl.appendChild(buttonRow);

    var status = document.createElement("div");
    status.className = "tver-speed-addon-current";
    status.textContent =
      "現在: " + formatSpeedLabel(settings.speed) + "   自動適用: " + (settings.autoApply ? "ON" : "OFF");
    panelEl.appendChild(status);
  }

  // --- 初期化 -----------------------------------------------------------------

  function init() {
    loadSettings().then(function () {
      renderPanel();
      scanVideos();
      startObservers();
      startPolling();
    });
  }

  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    var readyObserver = new MutationObserver(function () {
      if (document.body) {
        readyObserver.disconnect();
        callback();
      }
    });
    readyObserver.observe(document.documentElement, { childList: true });
  }

  whenBodyReady(init);
})();
