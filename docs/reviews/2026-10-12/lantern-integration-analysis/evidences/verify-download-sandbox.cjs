const { chromium } = require('D:/kleym/.worktrees/ci-issue-qualification/node_modules/@playwright/test');
const { createServer } = require('node:http');
const { writeFileSync } = require('node:fs');

const fixture = `<!doctype html><button id="save">Save harmless CSV</button><script>
save.onclick = () => {
  const url = URL.createObjectURL(new Blob(['label,amount\\nexample,1\\n'], {type:'text/csv'}));
  const a = document.createElement('a'); a.href=url; a.download='sandbox-probe.csv';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};</script>`;
function serve(handler) {
  return new Promise(resolve => {
    const server=createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
(async () => {
  let browser, parent, child;
  try {
    child=await serve((_req,res) => { res.setHeader('Content-Type','text/html'); res.end(fixture); });
    const childUrl=`http://127.0.0.1:${child.address().port}`;
    parent=await serve((req,res) => {
      const extra=new URL(req.url,'http://localhost').searchParams.has('downloads') ? ' allow-downloads' : '';
      res.setHeader('Content-Type','text/html');
      res.end(`<iframe sandbox="allow-scripts allow-forms allow-popups allow-same-origin${extra}" src="${childUrl}"></iframe>`);
    });
    browser=await chromium.launch({headless:true});
    const cases=[];
    for (const allowDownloads of [false,true]) {
      const page=await browser.newPage({acceptDownloads:true});
      const logs=[]; page.on('console',msg => { if(msg.text().includes('sandbox')) logs.push(msg.text().replace(/blob:[^ '\"]+/g,'blob:[local-fixture]')); });
      await page.goto(`http://127.0.0.1:${parent.address().port}/${allowDownloads ? '?downloads=1' : ''}`);
      const download=page.waitForEvent('download',{timeout:2000}).catch(() => null);
      await page.frameLocator('iframe').locator('#save').click();
      const result=await download;
      cases.push({allowDownloads,downloadObserved:!!result,downloadCompleted:result ? (await result.failure()) === null : false,logs});
      await page.close();
    }
    const report={sourceCommit:'ed512f6d3a478e4fc9eaab498627a6d0f8165d30',browser:browser.version(),scope:'Synthetic cross-origin Chromium fixture, harmless CSV, no wallet or ledger activity; not an APK test',cases,acceptancePassed:!cases[0].downloadObserved && cases[1].downloadCompleted};
    writeFileSync(`${__dirname}/download-sandbox-proof.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    if (!report.acceptancePassed) process.exitCode=1;
  } finally {
    await browser?.close(); parent?.close(); child?.close();
  }
})().catch(error => {console.error(error.message);process.exitCode=1});
