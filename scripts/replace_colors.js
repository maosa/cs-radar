const fs = require('fs');
const path = require('path');

const directoryPaths = [
  path.join(__dirname, '../app'),
  path.join(__dirname, '../components'),
];

const replacements = [
  { regex: /\[#19153F\]/g, replacement: "navy" },
  { regex: /\[#2a2460\]/g, replacement: "navy-hover" },
  { regex: /\[#38308F\]/g, replacement: "navy-mid" },
  { regex: /\[#B4AFE4\]/g, replacement: "navy-light" },
  { regex: /\[#00D1BA\]/g, replacement: "teal" },
  { regex: /\[#C3FFF8\]/g, replacement: "teal-light" },
  { regex: /\[#0020BA\]/g, replacement: "blue" },
  { regex: /\[#BDC7FF\]/g, replacement: "blue-light" },
  { regex: /\[#FFD300\]/g, replacement: "yellow" },
  { regex: /\[#FFF7CB\]/g, replacement: "yellow-light" },
  { regex: /\[#FF0522\]/g, replacement: "red-flag" },
  { regex: /\[#FFCDD3\]/g, replacement: "red-flag-light" },
  { regex: /\[#CC0015\]/g, replacement: "red-dark" },
  { regex: /\[#CC0515\]/g, replacement: "red-btn" },
  { regex: /\[#a8030f\]/g, replacement: "red-btn-hover" },
  { regex: /\[#FFF0F2\]/g, replacement: "red-hover" },
  { regex: /\[#FFFFFF\]/g, replacement: "surface" },
  { regex: /\[#F2F2F2\]/g, replacement: "bg" },
  { regex: /\[#DADADA\]/g, replacement: "border" },
  { regex: /\[#aaa\]/g, replacement: "border-hover" },
  { regex: /\[#595959\]/g, replacement: "text-secondary" },
  { regex: /\[#797979\]/g, replacement: "text-muted" },
];

function processDirectory(directoryPath) {
  const files = fs.readdirSync(directoryPath);
  for (const file of files) {
    const fullPath = path.join(directoryPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const { regex, replacement } of replacements) {
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

directoryPaths.forEach(processDirectory);
console.log('Done!');
