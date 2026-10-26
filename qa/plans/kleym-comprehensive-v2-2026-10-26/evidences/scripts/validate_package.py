from pathlib import Path
import json,re,hashlib
from openpyxl import load_workbook
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[2]
data=json.loads((ROOT/'evidences/case-specs.json').read_text(encoding='utf-8'))
wb=load_workbook(ROOT/'kleym-comprehensive-test-cases-v2.xlsx')
rows=list(wb['Test Cases'].values)[1:];assert len(rows)==373
assert len(set(r[0] for r in rows))==373 and all(r[14]=='Not Run' for r in rows)
assert wb['Test Cases'].freeze_panes=='D2'
assert wb['Controls'].max_row-1==296 and wb['Pages'].max_row-1==24 and wb['API Matrix'].max_row-1==121
executions=list(wb['Execution'].values)[1:];assert len(executions)==34
assert len(set((r[0],r[1]) for r in executions))==34 and all(r[9]=='Passed' for r in executions)
assert len(wb['Test Cases'].data_validations.dataValidation)==1
assert wb['Summary']['B2'].value=="=COUNTIF('Test Cases'!O2:O374,A2)"
issues=[]
for file in ROOT.rglob('*'):
    if not file.is_file():continue
    if file.suffix=='.pdf':text='\n'.join(page.extract_text() or '' for page in PdfReader(file).pages)
    elif file.suffix=='.xlsx':text='\n'.join(str(c.value or '') for s in load_workbook(file) for row in s for c in row)
    elif file.suffix in ['.json','.md','.py','.mjs']:text=file.read_text(encoding='utf-8-sig')
    else:continue
    if re.search(r'(?<![A-Z2-7])S[A-Z2-7]{55}(?![A-Z2-7])|zen_(?:live|test)_[A-Za-z0-9]{16,}|/claim#[^\s"<>]{10,}',text):issues.append(str(file.relative_to(ROOT)))
    if file.suffix=='.pdf' and any(t in text for t in ['\u00c3\u0097','\u00e2\u20ac\u201d']):issues.append('Encoding: '+str(file))
assert not issues,issues
plan_text='\n'.join(p.extract_text() or '' for p in PdfReader(ROOT/'kleym-comprehensive-test-plan-v2.pdf').pages)
assert all(c['id'] in plan_text for c in data['cases'])
manifest=dict(case_count=373,scoped_observations=34,all_catalog_statuses='Not Run',pages=24,api_methods=121,controls=296,unique_ids=True,workbook_reopened=True,formula_and_validation_checked=True,formula_cache_recalculated=False,secret_pattern_scan='Passed; synthetic fixtures and screenshots still require human privacy review',files={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in ROOT.glob('*') if f.suffix in ['.pdf','.xlsx']})
(ROOT/'evidences/final-package-validation.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
