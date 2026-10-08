"""Bounded candidate artifact scan; outputs filenames/line numbers, never values.

Not an assurance of absence of credentials. Review image artifacts separately.
"""
from pathlib import Path
import subprocess
import json
import re
import hashlib
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[4]
changed = subprocess.check_output(['git','diff','--name-only'],cwd=root,text=True).splitlines()
extra = subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()
files = sorted(set(changed+extra))
out = Path(__file__).resolve().parent/'candidate-scan.json'
hits, binaries, hashes = [], [], {}
patterns = {
    'literal_stellar_seed': re.compile(r'S[A-Z2-7]{55}'),
    'complete_bearer_fragment': re.compile(r'#(?:s|secret|seed)=S[A-Z2-7]{55}'),
    'github_token': re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),
    'api_key_literal': re.compile(r'klm_[0-9a-f]{8}_[A-Za-z0-9_-]{15,}'),
    'private_key_block': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}
for name in files:
    path = root/name
    if not path.is_file() or path == out: continue
    data = path.read_bytes()
    hashes[name] = hashlib.sha256(data).hexdigest()
    if b'\0' in data and not data.startswith((b'\xff\xfe',b'\xfe\xff')):
        binaries.append(name);continue
    try: text = data.decode('utf-16' if data.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8')
    except UnicodeDecodeError: binaries.append(name);continue
    for label,pattern in patterns.items():
        for match in pattern.finditer(text):
            hits.append(dict(path=name,line=text[:match.start()].count('\n')+1,kind=label))
result = dict(captured_at_utc=datetime.now(timezone.utc).isoformat(),text_files_scanned=len(hashes)-len(binaries),
              binary_files_require_separate_review=binaries,findings=hits,
              scope='Changed/untracked nonignored candidate files; bounded literal patterns only, not all credentials/mnemonics or image OCR',sha256=hashes)
out.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(dict(text_files_scanned=result['text_files_scanned'],binary_count=len(binaries),findings=hits),indent=2))
assert not hits
