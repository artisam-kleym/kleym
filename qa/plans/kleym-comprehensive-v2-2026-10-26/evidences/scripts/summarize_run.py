"""Append scoped observations, never promote an entire larger catalog case."""
from pathlib import Path
import json
from collections import Counter
from openpyxl import load_workbook
ROOT=Path.cwd();OUT=ROOT/'qa/plans/kleym-comprehensive-v2-2026-10-26';EV=OUT/'evidences';RUN=EV/'runs/hosted-20261026'
meta=json.loads((EV/'case-specs.json').read_text())['metadata'];records=[]
BASE='4b5f29920383d3730f81cd4c9633a581b4ae29ae'
for platform,file in [('Desktop Chromium 1280px','desktop-route-smoke.json'),('Responsive Chromium 360px, desktop UA','responsive-360-route-smoke.json')]:
    for r in json.loads((RUN/file).read_text()):
        ok=bool(r['headings']) and not r['unexpectedError'] and r['documentWidth']<=r['viewport']
        records.append(dict(id=f'SMK-{len(records)+1:03}',candidate=BASE,platform=platform,scope='Page load/layout only: '+r['route'],expected='Nonempty expected headings, no application-error screen and no page-wide horizontal overflow.',actual=r,status='Passed' if ok else 'Failed',evidence='evidences/runs/hosted-20261026/'+file,limitation='Not a full pass of the page-contract case: conditional controls, role permutations and all mutations are not exercised by this observation.'))
for title,actual,file in [
('Android login/dashboard','Authorized sign-in reached the dashboard with correct Testnet warning.','android-emulator-dashboard.png'),
('Android campaign wallet choices','Native Android Chrome shows Connect Freighter on phone and manual Funding account entry; Mainnet unavailable.','android-emulator-wallet-options.png'),
('Android header to Settings','Top menu opened and Settings navigation reached a usable password form.','android-emulator-settings.png'),
('Android logout','Log out returned to the sign-in page.','android-emulator-logged-out.png'),
('Responsive Settings fields','At360px all three password-type fields measured287x49 CSSpx with no page-wide overflow.','mobile-settings.png'),
('Invalid campaign input','Invalid public address and negative amount leave Continue disabled; positive amount guidance appears.','invalid-campaign-input.png')]:
    records.append(dict(id=f'SMK-{len(records)+1:03}',candidate=BASE,platform='Android emulator Chrome134' if title.startswith('Android') else 'Responsive Chromium360',scope=title,expected=actual,actual=actual,status='Passed',evidence='evidences/runs/hosted-20261026/'+file,limitation='Exact named observation only; no wallet signing or asset movement in this run.'))
records.append(dict(id='SMK-033',candidate=BASE,platform='Responsive Chromium360',scope='Header menu closes with Escape',expected='Menu button returns to collapsed state and destination links/logout are exposed when expanded.',actual='Observed Menu/Close menu toggle, all seven destination links and Log out; Escape restored Menu.',status='Passed',evidence='EXECUTION-SUMMARY.md',limitation='Keyboard behavior; real TalkBack was not tested.'))
records.append(dict(id='SMK-034',candidate=BASE,platform='Responsive Chromium360',scope='Manual public-address balance fallback',expected='Correct public account resolves without signing; USDC capacity shown.',actual='GBV6…OQQY5A resolved to16USDC available and0XLM; Continue enabled for1USDC.',status='Passed',evidence='EXECUTION-SUMMARY.md',limitation='Read-only lookup; not funding authorization.'))
(EV/'execution-observations.json').write_text(json.dumps(dict(candidate=meta['candidate'],scope='Named scoped checks, not full catalog execution',counts=dict(Counter(r['status'] for r in records)),records=records),indent=2)+'\n')
verification=dict(candidate=meta['candidate'],tests=dict(passed=943,files=90,failed=0,duration_seconds=58.44),focused=dict(before_patch_failed=2,after_patch_passed=3),typecheck='Passed',eslint='Passed',production_build='Passed; Next16.4.3/Node24.22.1',production_audit=json.loads((EV/'production-audit.json').read_text(encoding='utf-8-sig'))['metadata']['vulnerabilities'],physical_wallet='Not executed in this run; earlier evidence stays scoped to its SHA',mainnet='Disabled; not qualified')
(EV/'source-verification.json').write_text(json.dumps(verification,indent=2)+'\n')
wb=load_workbook(OUT/'kleym-comprehensive-test-cases-v2.xlsx');ws=wb['Execution']
def upsert(sheet,values,key_columns):
    existing=next((r for r in range(2,sheet.max_row+1) if all(sheet.cell(r,n+1).value==values[n] for n in key_columns)),None)
    if existing:
        for n,value in enumerate(values,1):sheet.cell(existing,n,value)
    else:sheet.append(values)
for r in records:upsert(ws,['hosted-20261026',r['id'],r['candidate'],r['platform'],'26 October 2026; exact capture times in evidence file metadata','Codex supervised tools',r['scope'],r['expected'],json.dumps(r['actual']) if isinstance(r['actual'],dict) else r['actual'],r['status'],r['evidence'],'',r['limitation']],[0,1])
d=wb['Defects']
upsert(d,['KLM-QA-20261026-01','KLM-V2-EMAIL-012','Unavailable reminder controls in local-link creator','P2 usability',BASE,'Open new local-link campaign stage2','No reminder option that cannot send a useful reminder','Remind by email checkboxes visible for OPEN and disabled but visible for EMAIL','evidences/runs/hosted-20261026/prepatch-recipient-controls.png; source steps.tsx','Product UI','Fixed in source; hosted retest after deployment','3 focused tests pass'],[0])
upsert(d,['KLM-QA-20261026-02','KLM-V2-POLICY-008','Passkey description overstates leaked-key protection','P1 misleading security copy',BASE,'Read first-device policy description','State Kleym gate and retained bearer-key risk','Copy claimed a later copy is useless, although off-app possession of the key is not an added on-chain passkey signer','src/app/(sender)/campaigns/new/steps.tsx; prepatch render regression','Product copy','Fixed in source; hosted retest after deployment','Focused regression passes'],[0])
for sh in [ws,d]:
    from openpyxl.styles import Alignment
    for row in sh.iter_rows(min_row=2):
        for cell in row:cell.alignment=Alignment(wrap_text=True,vertical='top')
        sh.row_dimensions[row[0].row].height=90
wb.save(OUT/'kleym-comprehensive-test-cases-v2.xlsx')
print(json.dumps(dict(scoped_observations=len(records),statuses=dict(Counter(r['status'] for r in records)),catalog_cases=meta['case_count'],catalog_statuses=meta['statuses'])))
