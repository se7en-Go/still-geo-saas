const fs = require('fs');
const path = 'frontend/src/pages/ContentGenerationPage.js';
let code = fs.readFileSync(path, 'utf8');
const paginationPattern = /pagination=\{\{[^}]*showTotal: \(total\) => [^]*[^}]*\}\}/;
code = code.replace(
  paginationPattern,
  pagination={{
          pageSize: 5,
          showSizeChanger: true,
          showTotal: (total) => \¹² \ Ìõ\,
        }}
);
fs.writeFileSync(path, code, 'utf8');
