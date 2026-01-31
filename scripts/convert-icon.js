const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const jpegPath = path.join(root, "logo.jpeg");
const pngPath = path.join(root, "logo.png");

if (!fs.existsSync(jpegPath)) {
  console.error("未找到 logo.jpeg，请放在项目根目录。");
  process.exit(1);
}

// 使用 sharp 将 JPEG 转为 PNG（需先 npm install sharp）
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.error("请先执行: npm install sharp");
  process.exit(1);
}

sharp(jpegPath)
  .png()
  .toFile(pngPath)
  .then(() => console.log("已生成 logo.png"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
