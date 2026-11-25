import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

test('a verified cached PDF can be parsed while its external source is unavailable', async t => {
  try { execFileSync('python',['-c','import fitz'],{stdio:'ignore'}); } catch { t.skip('PyMuPDF is not installed in this test environment'); return; }
  const dir=await mkdtemp(path.join(tmpdir(),'paperpulse-cache-test-'));
  try {
    const folder=path.join(dir,'paper-assets','qa-cache');await mkdir(folder,{recursive:true});
    execFileSync('python',['-c',String.raw`import fitz,sys,textwrap
d=fitz.open();p=d.new_page()
text='1 Introduction\n'+textwrap.fill('Document reasoning needs reliable source evidence. '*14,75)+'\n2 Method\nWe propose a graph-based extraction method using verified documents.\n3 Results\nResults show that the extraction returns the original source passages.\n4 Conclusion\nThe cached document remains available without network access.'
p.insert_text((50,50),text,fontsize=10);d.save(sys.argv[1])`,path.join(folder,'source.pdf')]);
    const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
      const {parsePaperEvidence}=await import('./server/paperParsing.ts');
      const paper={id:'qa-cache',title:'Cached Document Reasoning',abstractOriginal:'',url:'https://unavailable.invalid/paper',anatomy:{}};
      const result=await parsePaperEvidence(paper,true);
      console.log(JSON.stringify({status:result.parsing.status,local:result.localPdfUrl,method:result.anatomy.proposedMethod,conclusion:result.anatomy.conclusion}));
    `],{encoding:'utf8',env:{...process.env,DATA_DIR:dir,DASHSCOPE_API_KEY:''},timeout:15000});
    const result=JSON.parse(output);
    assert.equal(result.status,'full_text');
    assert.equal(result.local,'/paper-assets/qa-cache/source.pdf');
    assert.match(result.method,/graph-based extraction/);
    assert.match(result.conclusion,/without network access/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
    assert.ok(path.basename(dir).startsWith('paperpulse-cache-test-'));
    await rm(dir,{recursive:true,force:true});
  }
});
