const fs = require('fs');
const path = 'frontend/src/pages/ContentGenerationPage.js';
let code = fs.readFileSync(path, 'utf8');
const snippet = `<Space>
            <Button type="link" onClick={() => setViewRecord(record)}>
              \\u67e5\\u770b
            </Button>
            <Button type="link" danger onClick={() => handleDelete(record.id)}>
              \\u5220\\u9664
            </Button>
          </Space>`;
const replacement = `<Space>
            <Button type="link" onClick={() => setViewRecord(record)}>
              \\u67e5\\u770b
            </Button>
            <Button type="link" danger onClick={() => handleDelete(record.id)}>
              \\u5220\\u9664
            </Button>
          </Space>`;
code = code.replace(snippet, replacement);
fs.writeFileSync(path, code, 'utf8');
