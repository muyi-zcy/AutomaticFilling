// 当前版本主要逻辑都在 content.js，这里先预留做统一转发/权限兜底。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AF_PING") {
    sendResponse({ ok: true, from: "background" });
    return true;
  }
  return false;
});



