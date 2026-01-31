const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const textEl = document.getElementById("text");
const speedEl = document.getElementById("speed");
const wpmDisplayEl = document.getElementById("wpmDisplay");
const punctuationPauseEl = document.getElementById("punctuationPause");
const autoEnterEl = document.getElementById("autoEnter");

const STORAGE_KEY_POPUP = "af_popup_text";

function setStatus(text) {
  statusEl.textContent = text || "";
}

function wpmToDelayMs(wpm) {
  if (!wpm || wpm <= 0) return 500;
  return Math.round(60000 / wpm);
}

function updateWpmDisplay() {
  const wpm = parseInt(speedEl.value, 10) || 120;
  wpmDisplayEl.textContent = wpm;
}

speedEl.addEventListener("input", updateWpmDisplay);
updateWpmDisplay();

// 打开时恢复输入框内容
(async () => {
  try {
    const { [STORAGE_KEY_POPUP]: saved } = await chrome.storage.local.get(STORAGE_KEY_POPUP);
    if (saved != null && typeof saved === "string") textEl.value = saved;
  } catch {
    // ignore
  }
})();

// 输入时保存，避免关闭后丢失（防抖）
let saveTextTimeout = null;
textEl.addEventListener("input", () => {
  if (saveTextTimeout) clearTimeout(saveTextTimeout);
  saveTextTimeout = setTimeout(() => {
    saveTextTimeout = null;
    chrome.storage.local.set({ [STORAGE_KEY_POPUP]: textEl.value }).catch(() => {});
  }, 300);
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestrictedUrl(url) {
  if (!url) return false;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("未找到当前标签页");
  if (isRestrictedUrl(tab.url)) {
    throw new Error("该页面不允许注入插件脚本（如 chrome:// 或应用商店页）。请换一个普通网页再试。");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    await ensureContentScript(tab.id);
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

startBtn.addEventListener("click", async () => {
  try {
    const text = textEl.value;
    if (!text || !text.trim()) {
      setStatus("请先在上方输入要自动填写的内容。");
      textEl.focus();
      return;
    }
    const wpm = parseInt(speedEl.value, 10) || 120;
    const delayMs = Math.max(20, Math.min(2000, wpmToDelayMs(wpm)));
    const punctuationPause = punctuationPauseEl.checked;
    const autoEnter = autoEnterEl.checked;

    chrome.storage.local.set({ [STORAGE_KEY_POPUP]: text }).catch(() => {});
    setStatus("已启动，请切回页面点击要填写的输入框…");
    await sendToActiveTab({
      type: "AF_START_PICK",
      payload: {
        text,
        wpm,
        delayMs,
        punctuationPause,
        autoEnter
      }
    });
    window.close();
  } catch (e) {
    setStatus(`启动失败：${e?.message || e}`);
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "AF_STOP" });
    setStatus("已停止。");
  } catch (e) {
    setStatus(`停止失败：${e?.message || e}`);
  }
});

(async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    if (isRestrictedUrl(tab.url)) {
      setStatus("当前页面不支持（如 chrome://）。请打开一个普通网页。");
      return;
    }
    let res;
    try {
      res = await chrome.tabs.sendMessage(tab.id, { type: "AF_GET_STATE" });
    } catch {
      await ensureContentScript(tab.id);
      res = await chrome.tabs.sendMessage(tab.id, { type: "AF_GET_STATE" });
    }
    if (res?.picking) setStatus("当前：等待你点击输入框…");
    else if (res?.typing) setStatus("当前：正在自动输入…");
    else setStatus("当前：空闲。");
  } catch {
    // ignore
  }
})();
