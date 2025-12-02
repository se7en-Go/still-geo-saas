const fs = require('fs');
const path = 'frontend/src/pages/ContentGenerationPage.js';
let code = fs.readFileSync(path, 'utf8');
const replacements = new Map([
  ['\u4e2d\uff1f', '中性'],
  ['\u6280\uff1f', '技巧'],
  ['\u7d20\u6750\uff1f', '素材库'],
  ['\u81ea\u5b9a\uff1f', '自定义'],
  ['????????', '生成详情'],
  ['??', '摘要'],
  ['????', '正文']
]);
for (const [placeholder, actual] of replacements.entries()) {
  code = code.replace(new RegExp(placeholder, 'g'), actual);
}
fs.writeFileSync(path, code, 'utf8');
