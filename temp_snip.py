# -*- coding: utf-8 -*-
from pathlib import Path
text = Path('frontend/src/pages/KeywordPage.js').read_text(encoding='utf-8', errors='ignore')
needle = ") : (\n          <Space>"
start = text.find(needle)
print(text[start:start+1400])
