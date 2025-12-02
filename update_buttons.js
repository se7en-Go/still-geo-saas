const fs = require('fs');
const path = 'frontend/src/pages/ContentGenerationPage.js';
let code = fs.readFileSync(path, 'utf8');
const target = `<Space>
            <Button type="link" onClick={() => setViewRecord(record)}>
              \\u67e5\\u770b
            </Button>
            <Button type="link" danger onClick={() => handleDelete(record.id)}>
              \\u5220\\u9664
            </Button>
          </Space>`;
const replacement = `<Space>
            <Button type="link" onClick={() => setViewRecord(record)}>
              {'\\u67e5\\u770b'}
            </Button>
            <Button type="link" danger onClick={() => handleDelete(record.id)}>
              {'\\u5220\\u9664'}
            </Button>
          </Space>`;
if (!code.includes(target)) {
  throw new Error('target snippet not found');
}
code = code.replace(target, replacement);
fs.writeFileSync(path, code, 'utf8');
