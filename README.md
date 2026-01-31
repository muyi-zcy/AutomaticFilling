# Automatic Filling (逐字输入)

Chrome extension (Manifest V3) that types preset text character-by-character into any input on a webpage, with adjustable speed, punctuation pauses, cursor kept at the end, and no overwriting of existing content.

### Demo

![Demo](demo.gif)

---

## Features

- **Pick an input**: After clicking “Start & pick input”, click a target field on the page (`input`, `textarea`, or `contenteditable`) to start appending text there.
- **No overwrite**: Appends to the end of existing content instead of clearing it.
- **Cursor at end**: Keeps the caret at the end of the text while typing.
- **Adjustable speed**: Slider for characters per minute (about 30–300) to control typing interval.
- **Punctuation pause**: When “Pause after punctuation” is enabled, adds ~0.35s delay after punctuation for a more natural rhythm.
- **Content persisted**: Text in the popup input is saved and restored when you reopen the popup.

---

## Installation

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder (the one containing `manifest.json`).

---

## How to use

1. Open the webpage you want to use.
2. Click the extension icon. In the popup:
   - Enter or paste the text to type (multi-line supported).
   - Set **characters per minute** with the slider.
   - Optionally enable **Pause after punctuation**.
3. Click **Start & pick input**. The popup closes.
4. On the page, click the target input field.
5. The extension types into that field from the end. You can click the icon again and **Stop** to cancel.

> Not supported on restricted pages such as `chrome://`, `edge://`, or the Chrome Web Store. Use a normal webpage.

---

## Technical notes

- **Selector**: The extension records the input using `#id` when possible, then `name`, otherwise a short CSS path for stable targeting.
- **Events**: Typing triggers `input` / `change` and uses the native value setter where possible for React and other controlled components.
- **Storage**: `chrome.storage.local` is used to persist popup text and last-used settings.

---

## Project structure

```
automaticFilling/
├── manifest.json   # Extension config (MV3)
├── popup.html      # Popup UI
├── popup.js        # Popup logic (speed, options, storage)
├── content.js      # Page script (pick input, type text)
├── background.js   # Service worker
├── README.md       # This file (English)
├── README.zh-CN.md # Chinese version
└── demo.gif
```
