import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('uncertain PDF metadata stays explicit without guessed journal, date or research topic',()=>{
  const script=`
    const {buildUploadedPaper}=await import('./server/uploadedPdf.ts');
    const p=await buildUploadedPaper({text:'This document studies nonlinear hydrodynamic stability.',sections:{},pages:1,metadata:{title:'Nonlinear hydrodynamic stability',authors:[],doi:'',arxivId:'',publishedDate:''}},'pdf-test',{userId:'user',username:'reader',displayName:'Reader',fileName:'paper.pdf',uploadedAt:'2026-11-26T00:00:00Z',sha256:'test'});
    console.log(JSON.stringify(p));
  `;
  const p=JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,DISABLE_UPLOAD_METADATA_LOOKUP:'1'}}));
  assert.equal(p.publishedDate,'');assert.equal(p.journalShort,'待核实');assert.deepEqual(p.topics,[]);
  assert.equal(p.anatomy.dataset.sourceType,'unspecified');assert.deepEqual(p.anatomy.dataset.modalities,[]);
  assert.equal(p.anatomy.comparisonMetrics.hasQuantitativeData,false);
  assert.ok(p.parsing.warnings.some(s=>s.includes('发表日期')));
});

test('PDF uploads are authenticated, traceable, resumable, parsed and deduplicated in the public pool',async t=>{
  try {execFileSync('python',['-c','import fitz'],{stdio:'ignore'});}catch {t.skip('PyMuPDF is required');return;}
  const dir=await mkdtemp(path.join(tmpdir(),'paperpulse-upload-'));
  const pdf=path.join(dir,'design.pdf'),other=path.join(dir,'other.pdf');
  execFileSync('python',['-c',String.raw`import fitz,sys,textwrap
for filename,title in [(sys.argv[1],'Automated Product Design with Public ImageNet Data'),(sys.argv[2],'Multi-Agent Human-AI Collaboration for Product Design')]:
 d=fitz.open();d.set_metadata({'title':title,'author':'Alice Researcher, Bob Engineer'})
 p=d.new_page();p.insert_text((40,35),'Journal of Mechanical Design',fontsize=10);p.insert_text((40,65),title,fontsize=15)
 p.insert_text((40,90),'Published: 2026-05-12',fontsize=10)
 p.insert_textbox(fitz.Rect(40,110,550,360),'Abstract\n'+textwrap.fill('We propose a product design method using the publicly available ImageNet dataset. However, reliable design requires verified evidence. Results show that the method supports engineering design. '*3,90)+'\nKeywords: product design; ImageNet; design optimization\n1 Introduction\nReliable product design needs evidence from public data.',fontsize=10)
 p.draw_rect(fitz.Rect(60,380,230,445),color=(0,0,1));p.draw_rect(fitz.Rect(310,380,500,445),color=(0,0,1));p.draw_line((230,415),(310,415));p.insert_text((80,412),'Input data');p.insert_text((330,412),'Design method')
 p.insert_text((40,465),'Figure 1: Proposed framework for product design.',fontsize=10)
 p.insert_textbox(fitz.Rect(40,500,550,740),'2 Method\nWe propose a graph-based design optimization method grounded in source evidence.\n3 Experiments\nWe evaluate the method on the publicly available ImageNet dataset. Table 1 reports the original measurements.\n4 Conclusion\nThe design pipeline retains its original evidence and measurements.',fontsize=10)
 p=d.new_page();p.insert_text((40,60),'Table 1: Original experimental accuracy results.',fontsize=11)
 for y in [85,110,145]:p.draw_line((40,y),(550,y))
 p.insert_text((60,103),'Method');p.insert_text((300,103),'Accuracy');p.insert_text((60,132),'Source method');p.insert_text((300,132),'93.7')
 d.save(filename)
`,pdf,other]);
  // Deliberately slow translation lets the test restart a real in-flight job.
  const translator=createServer(async(req,res)=>{
    for await(const _ of req){}
    await new Promise(r=>setTimeout(r,100));
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({translatedText:'根据原文，研究提出设计优化方法，并在公开数据集上开展实验验证。'}));
  });
  await new Promise(r=>translator.listen(0,'127.0.0.1',r));
  let server,logs='';const base='http://127.0.0.1:13992';
  const start=async()=>{
    server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,DATA_DIR:dir,HOST:'127.0.0.1',PORT:'13992',DISABLE_AUTO_SYNC:'1',DISABLE_AUTO_LOCALIZATION:'1',DISABLE_UPLOAD_METADATA_LOOKUP:'1',LOCAL_TRANSLATION_URL:`http://127.0.0.1:${translator.address().port}/translate`,BOOTSTRAP_ADMIN_PASSWORD:'test-upload-admin'},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
    throw new Error(logs);
  };
  const stop=async()=>{
    if(!server||server.exitCode!==null)return;
    const done=new Promise(r=>server.once('exit',r));
    if(process.platform==='win32')await new Promise(r=>spawn('taskkill',['/pid',String(server.pid),'/T','/F'],{stdio:'ignore'}).once('exit',r));else server.kill();
    await done;
  };
  const request=async(route,token,method='GET',body,extra={})=>{
    const binary=Buffer.isBuffer(body);
    const res=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':binary?'application/pdf':'application/json',...extra},body:body===undefined?undefined:binary?body:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  };
  const wait=async(id,token)=>{
    for(let i=0;i<240;i++) {
      const result=await request('/api/pdf-imports/'+id,token);
      if(result.data.job.status==='failed')throw new Error(JSON.stringify(result.data)+'\n'+logs);
      if(result.data.job.status==='completed')return result.data.job;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('upload timeout\n'+logs);
  };
  try {
    await start();const bytes=await readFile(pdf);
    assert.equal((await request('/api/papers/upload-pdf',null,'POST',bytes)).status,401);
    assert.equal((await request('/api/pdf-imports',null)).status,401);
    const a=(await request('/api/auth/register',null,'POST',{username:'upload-alice',password:'test-alice'})).data;
    const b=(await request('/api/auth/register',null,'POST',{username:'upload-bob',password:'test-bob'})).data;
    const root=(await request('/api/auth/login',null,'POST',{username:'admin',password:'test-upload-admin'})).data;
    assert.equal((await request('/api/papers/upload-pdf',a.token,'POST',Buffer.from('not a pdf'))).status,415);
    assert.equal((await request('/api/papers/upload-pdf',a.token,'POST',Buffer.alloc(32*1024*1024+1))).status,413);
    const initialCount=(await request('/api/papers',a.token)).data.total;
    const upload=await request('/api/papers/upload-pdf',a.token,'POST',bytes,{'X-File-Name':encodeURIComponent('../../design.pdf'),'X-User-Id':b.user.id});
    assert.equal(upload.status,202);const id=upload.data.job.id;
    assert.equal((await request('/api/pdf-imports/'+id,b.token)).status,404);
    assert.equal((await request('/api/pdf-imports/'+id,root.token)).status,200);
    // The accepted PDF and queue survive termination of the process handling it.
    await stop();await start();
    const job=await wait(id,a.token);
    assert.equal(job.alreadyExists,false);
    const paper=(await request('/api/papers/'+job.paperId,b.token)).data.paper;
    assert.equal((await request('/api/papers',b.token)).data.total,initialCount+1);
    assert.equal(paper.upload.userId,a.user.id);assert.notEqual(paper.upload.userId,b.user.id);
    assert.ok(!paper.upload.fileName.includes('/'));
    assert.equal(paper.journalShort,'JMD');assert.equal(paper.publishedDate,'2026-05-12');
    assert.ok(paper.topics.includes('ProductDesign'));assert.equal(paper.anatomy.dataset.sourceType,'public');
    assert.equal(paper.parsing.status,'full_text');assert.match(paper.anatomy.proposedMethod,/根据原文/);
    assert.ok(paper.anatomy.paperFigures.length);assert.ok(paper.anatomy.paperTables.length);
    assert.equal(paper.anatomy.comparisonMetrics.hasQuantitativeData,false);
    assert.deepEqual(paper.anatomy.dataset.modalities,[]);
    assert.match(paper.abstractOriginal,/publicly available ImageNet/);
    assert.ok((await request('/api/papers/'+job.paperId,a.token)).data.paper.inMyKb);
    const saved=await fetch(base+paper.localPdfUrl,{headers:{Authorization:`Bearer ${b.token}`}});
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()),bytes);
    assert.equal((await fetch(base+paper.localPdfUrl)).status,401);
    assert.equal((await request('/api/papers/'+job.paperId,a.token,'DELETE')).status,403);
    const repeated=(await request('/api/papers/upload-pdf',b.token,'POST',bytes)).data.job;
    assert.equal((await wait(repeated.id,b.token)).alreadyExists,true);
    assert.equal((await request('/api/papers',b.token)).data.total,initialCount+1);
    const jobs=(await request('/api/pdf-imports',b.token)).data.jobs;
    assert.ok(jobs.every(j=>j.id!==id));assert.ok(jobs.every(j=>!j.user&&!j.sha256));
    const adminUpload=(await request('/api/papers/upload-pdf',root.token,'POST',await readFile(other),{'X-Add-To-Kb':'0'})).data.job;
    const adminJob=await wait(adminUpload.id,root.token);
    const adminPaper=(await request('/api/papers/'+adminJob.paperId,root.token)).data.paper;
    assert.equal(adminPaper.upload.userId,root.user.id);assert.equal(adminPaper.inMyKb,false);
    assert.ok(adminPaper.topics.includes('AgentCollaboration'));assert.ok(adminPaper.topics.includes('HumanAICollaboration'));
    const broken=(await request('/api/papers/upload-pdf',a.token,'POST',Buffer.from('%PDF-1.7\nbroken'))).data.job;
    for(let i=0;i<100;i++){const j=(await request('/api/pdf-imports/'+broken.id,a.token)).data.job;if(j.status==='failed')break;await new Promise(r=>setTimeout(r,50));}
    assert.equal((await request('/api/pdf-imports/'+broken.id,a.token)).data.job.status,'failed');
    assert.equal((await readdir(path.join(dir,'pdf-imports'))).filter(f=>f.endsWith('.pdf')).length,0);
  }finally {
    await stop();await new Promise(r=>translator.close(r));
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));assert.ok(path.basename(dir).startsWith('paperpulse-upload-'));
    await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
