const fs = require('fs');
const path = 'frontend/src/pages/ContentGenerationPage.js';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/<Text type="secondary">[^<]*<\/Text>/, '<Text type="secondary">\\u8bf7\\u9009\\u62e9\\u89c4\\u5219\\u67e5\\u770b\\u8be6\\u7ec6\\u914d\\u7f6e</Text>');
code = code.replace(/\.join\('[^']*'\)/, ".join('\\u3001')");
code = code.replace(/,\s*imageSourceLabels,\s*'[^']*'\)/, ",\n    imageSourceLabels,\n    '\\u7d20\\u6750\\u5e93'\n  )");
code = code.replace(/<Title level=\{5\} style=\{\{ marginBottom: 12 \}\}>[\s\S]*?\{rule\.rule_name\}/, "<Title level={5} style={{ marginBottom: 12 }}>");
fs.writeFileSync(path, code, 'utf8');
