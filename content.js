let afPicking = false;
let afTyping = false;
let afStopRequested = false;
let afOverlayEl = null;
let afCurrentText = "";
let afCurrentDelayMs = 45;
let afCurrentSpeedKey = "normal";
let afPunctuationPause = false;
let afAutoEnter = false;

// 标点符号（遇此类字符时若开启“标点后停顿”则多停一会儿）
const PUNCTUATION_CHARS = /[。，、；：！？．,.;:!?…—\-\s]/;

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return !["button", "submit", "checkbox", "radio", "file", "image", "hidden"].includes(type);
  }
  if (el.isContentEditable) return true;
  return false;
}

function escapeCssIdent(s) {
  // 简化版（够用）：优先走 CSS.escape
  if (window.CSS?.escape) return window.CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function getUniqueSelector(el) {
  // 1) id
  if (el.id) return `#${escapeCssIdent(el.id)}`;

  // 2) name（可能不唯一，但通常够用；不唯一时再走 path）
  const name = el.getAttribute?.("name");
  if (name) {
    const sel = `${el.tagName.toLowerCase()}[name="${CSS?.escape ? CSS.escape(name) : name.replace(/"/g, '\\"')}"]`;
    const matches = document.querySelectorAll(sel);
    if (matches.length === 1) return sel;
  }

  // 3) css path（尽量短）
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    let part = cur.tagName.toLowerCase();
    const cls = (cur.className || "")
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (cls.length) part += "." + cls.map(escapeCssIdent).join(".");
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    const candidate = parts.join(" > ");
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    } catch {
      // ignore
    }
    cur = cur.parentElement;
    if (parts.length > 6) break; // 不要过长
  }
  return parts.join(" > ");
}

function ensureOverlay() {
  if (afOverlayEl) return;
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.right = "0";
  el.style.bottom = "0";
  el.style.zIndex = "2147483647";
  el.style.background = "rgba(0,0,0,0.08)";
  el.style.backdropFilter = "blur(0px)";
  el.style.pointerEvents = "none";
  el.innerHTML = `
    <div style="
      position:fixed;left:50%;top:14px;transform:translateX(-50%);
      background:#111;color:#fff;padding:10px 12px;border-radius:10px;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Microsoft YaHei', sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
      opacity:.95;
    ">
      <div style="font-weight:600;margin-bottom:2px;">Automatic Filling：选择一个输入框</div>
      <div style="font-size:12px;opacity:.9;">请点击页面上的输入框（按 ESC 取消）。</div>
    </div>
  `;
  document.documentElement.appendChild(el);
  afOverlayEl = el;
}

function removeOverlay() {
  if (afOverlayEl) afOverlayEl.remove();
  afOverlayEl = null;
}

function fireInputEvents(el) {
  try {
    if (typeof InputEvent !== "undefined") {
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: null,
          composed: true
        })
      );
    } else {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    // ignore
  }
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = desc?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function setCursorToEnd(el) {
  try {
    if ("value" in el && typeof el.selectionStart === "number") {
      const len = (el.value || "").length;
      el.selectionStart = len;
      el.selectionEnd = len;
      el.setSelectionRange?.(len, len);
    } else if (el.isContentEditable) {
      el.focus?.();
      const sel = window.getSelection?.();
      if (sel) {
        sel.removeAllRanges?.();
        const range = document.createRange?.();
        if (range) {
          range.selectNodeContents(el);
          range.collapse(false);
          sel.addRange(range);
        }
      }
    }
  } catch {
    // ignore
  }
}

function fireKeyOnElement(el, key) {
  try {
    el.focus?.();
    const isEnter = key === "Enter";
    const code = isEnter ? "Enter" : key;
    const keyCode = isEnter ? 13 : 0;
    const opts = {
      bubbles: true,
      cancelable: true,
      key,
      code,
      keyCode,
      which: keyCode,
      charCode: isEnter ? 0 : undefined,
      composed: true
    };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", { ...opts, charCode: keyCode }));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
    // 若在表单内，合成事件不会触发浏览器默认“提交”，主动提交表单
    if (isEnter && el.form && el.tagName && el.tagName.toLowerCase() === "input") {
      const submitBtn = el.form.querySelector("button[type=submit], input[type=submit]");
      if (submitBtn) {
        submitBtn.click();
      } else {
        el.form.submit();
      }
    }
  } catch {
    // ignore
  }
}

async function typeIntoElement(el, text, delayMs = 40, punctuationPause = false) {
  afTyping = true;
  afStopRequested = false;
  const PUNCTUATION_EXTRA_MS = 350;

  try {
    el.focus?.();
    setCursorToEnd(el);

    for (const ch of text) {
      if (afStopRequested) break;

      if ("value" in el) {
        setNativeValue(el, `${el.value}${ch}`);
      } else if (el.isContentEditable) {
        el.textContent += ch;
      }

      fireInputEvents(el);
      setCursorToEnd(el);

      let waitMs = delayMs;
      if (punctuationPause && PUNCTUATION_CHARS.test(ch)) {
        waitMs += PUNCTUATION_EXTRA_MS;
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  } finally {
    afTyping = false;
  }
}

async function startPick(config) {
  if (afPicking) return;
  afPicking = true;
  afStopRequested = false;
  if (config && config.text) {
    afCurrentText = String(config.text);
    afCurrentDelayMs = typeof config.delayMs === "number" ? config.delayMs : 45;
    afCurrentSpeedKey = config.speedKey || "normal";
    afPunctuationPause = !!config.punctuationPause;
    afAutoEnter = !!config.autoEnter;
  }
  ensureOverlay();

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      cleanup();
    }
  };

  const onClickCapture = async (e) => {
    if (!afPicking) return;
    const path = typeof e.composedPath === "function" ? e.composedPath() : null;
    const candidates = Array.isArray(path) ? path : [e.target];
    let target = null;
    for (const node of candidates) {
      const el = node && node.nodeType === 1 ? node : null;
      if (!el) continue;
      const direct =
        el.matches?.("input,textarea,[contenteditable='true'],[contenteditable=''],[role='textbox']") ? el : null;
      const nearest = el.closest?.(
        "input,textarea,[contenteditable='true'],[contenteditable=''],[role='textbox']"
      );
      const pick = direct || nearest;
      if (pick && isEditable(pick)) {
        target = pick;
        break;
      }
    }
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const selector = getUniqueSelector(target);
    cleanup();

    const text = afCurrentText;
    const delayMs = afCurrentDelayMs;
    const speedKey = afCurrentSpeedKey;
    const punctuationPause = afPunctuationPause;
    const autoEnter = afAutoEnter;
    if (!text || !text.length) {
      return;
    }

    await chrome.storage.local.set({
      af_last: {
        url: location.href,
        selector,
        text,
        speedKey,
        delayMs,
        punctuationPause,
        autoEnter,
        at: Date.now()
      }
    });

    const el = document.querySelector(selector);
    if (!el) return;
    await typeIntoElement(el, text, delayMs, punctuationPause);
    if (autoEnter) {
      await new Promise((r) => setTimeout(r, 80));
      fireKeyOnElement(el, "Enter");
    }
  };

  function cleanup() {
    afPicking = false;
    removeOverlay();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("click", onClickCapture, true);
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("click", onClickCapture, true);
}

function stopAll() {
  afStopRequested = true;
  afPicking = false;
  removeOverlay();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (type === "AF_START_PICK") {
    startPick(message?.payload || null);
    sendResponse({ ok: true });
    return true;
  }
  if (type === "AF_STOP") {
    stopAll();
    sendResponse({ ok: true });
    return true;
  }
  if (type === "AF_GET_STATE") {
    sendResponse({ picking: afPicking, typing: afTyping });
    return true;
  }
  return false;
});


