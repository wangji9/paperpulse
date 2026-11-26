import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('new paper localization uses the free API, preserves sources and caches translations',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'paperpulse-translation-'));
  let requests=0;
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const {q}=JSON.parse(body);requests++;
    if((Array.isArray(q)?q:[q]).some(s=>s.length>2800)){res.statusCode=413;res.end('{}');return;}
    res.setHeader('Content-Type','application/json');
    const translate=s=>s==='Offline content'||s.length>700?undefined:'中文翻译：研究方法、实验与结论。';
    res.end(JSON.stringify({translatedText:Array.isArray(q)?q.map(translate):translate(q)}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`
      import assert from 'node:assert/strict';
      const {localizePaper}=await import('./server/localizePaper.ts');
      const {translateChinese}=await import('./server/translation.ts');
      const {chineseText}=await import('./src/lib/chinese.ts');
      const p={id:'new-paper',title:'Scientific Paper Title',titleZh:'',abstractOriginal:'Original abstract evidence.',digestSummary:'Research summary.',keywords:['scientific extraction'],anatomy:{background:'Research background.',problem:'Core research question.',proposedMethod:'A verified learning method.',paperFigures:[{captionOriginal:'Original scientific figure caption.'}]}};
      const result=await localizePaper(p);
      assert.match(result.titleZh,/中文/);assert.match(result.anatomy.background,/中文/);
      assert.match(result.anatomy.paperFigures[0].captionZh,/中文/);
      assert.equal(result.abstractOriginal,p.abstractOriginal);
      assert.match(result.abstractZh,/中文/);
      const offline=await localizePaper({...p,abstractOriginal:'Offline content'});
      assert.equal(offline.abstractZh,'');
      assert.equal(offline.abstractOriginal,'Offline content');
      assert.equal(offline.localization.status,'partial');
      assert.equal(result.anatomy.paperFigures[0].captionOriginal,p.anatomy.paperFigures[0].captionOriginal);
      assert.deepEqual(result.keywordsOriginal,['scientific extraction']);
      assert.equal(result.keywords[0],'中文翻译：研究方法、实验与结论。');
      assert.equal(p.anatomy.background,'Research background.');
      await translateChinese('Research background.');
      assert.equal(chineseText('Offline content'),'Offline content');
      assert.equal(await translateChinese('Offline content'),null);
      assert.match(await translateChinese('A complete scientific source sentence. '.repeat(100)),/中文/);
    `],{env:{...process.env,DATA_DIR:dir,LOCAL_TRANSLATION_URL:`http://127.0.0.1:${server.address().port}/translate`},stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',b=>errors+=b);
    const code=await new Promise(r=>child.on('exit',r));
    assert.equal(code,0,errors);
    assert.ok(requests>0&&requests<20,'fields use batching/cache and failed long segments receive bounded smaller retries');
  }finally {
    await new Promise(r=>server.close(r));
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
    assert.ok(path.basename(dir).startsWith('paperpulse-translation-'));
    await rm(dir,{recursive:true,force:true});
  }
});
