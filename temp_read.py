# -*- coding: utf-8 -*-
from pathlib import Path
text = Path('frontend/src/pages/KeywordPage.js').read_text(encoding='utf-8', errors='ignore')
start = text.index('const pagedVariations = useMemo(')
print(text[start:start+800])
