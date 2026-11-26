import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('the Qwen API retries failed segments without discarding valid neighboring translations',t=>{
  try {execFileSync('python',['--version'],{stdio:'ignore'});}catch {t.skip('Python is required');return;}
  execFileSync('python',['-c',String.raw`import importlib.util,json
s=importlib.util.spec_from_file_location('qwen_translation','translation/qwen_service.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
assert not m.valid('Research accuracy 0.91','Research accuracy 0.19')
assert m.valid('model pi 0',chr(27169)+chr(22411)+' '+chr(960)+chr(8320))
def partial(url,payload=None,timeout=180):
 if payload and 'format' in payload:return {'message':{'content':json.dumps({'translations':[chr(21407)+chr(25991)+chr(35777)+chr(25454),chr(30456)*100]})}}
 raise ValueError('temporarily unavailable')
m.request_json=partial
assert m.translate(['Source evidence','Bad output source'])==[chr(21407)+chr(25991)+chr(35777)+chr(25454),None]
`],{stdio:'pipe'});
});

test('translation checks reject repetitive output, altered measurements and generated chat markers',()=>{
  execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
    import assert from 'node:assert/strict';
    const q=await import('./server/translationQuality.ts');
    const {technicalTableValue,isChineseText}=await import('./server/translation.ts');
    assert.equal(technicalTableValue('ResNet50 ['),true);
    assert.equal(technicalTableValue('163.3 GB*'),true);
    assert.equal(technicalTableValue('EM@1'),true);
    assert.equal(technicalTableValue('Mean accuracy'),false);
    assert.equal(isChineseText('表2：LongMemEval s'),true);
    assert.equal(q.hasDegenerateRepetition('相'.repeat(80)),true);
    assert.equal(q.hasDegenerateRepetition('取回'.repeat(20)),true);
    assert.equal(q.hasDegenerateRepetition('The error is 0.000000001.'),false);
    assert.deepEqual(q.translationProblems('Accuracy 0.91 with 256 samples.','256个样本的准确率为0.91。'),[]);
    assert.deepEqual(q.translationProblems('The model pi 0 is evaluated.','评估模型π₀。'),[]);
    assert.ok(q.translationProblems('Accuracy 0.91 with 256 samples.','准确率为0.19。').length);
    assert.ok(q.translationProblems('A method.','方法。]}assistant'+String.fromCharCode(96).repeat(3)+'json[{').length);
    const source='First complete sentence. '+('Another full source sentence. '.repeat(8));
    assert.ok(q.sourceExcerpt(source,90).endsWith('.'));
    assert.equal(q.cleanSourceText('Source evidence.\\nReceived 21 July 2026\\n* Corresponding author.\\nhttps://doi.org/10.1/test\\nWe propose a method.'),'Source evidence. We propose a method.');
  `],{stdio:'pipe'});
});

test('legacy Chinese errors are retranslated from cached English and manual corrections stay intact',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'paperpulse-quality-'));
  const server=createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;
    const {q}=JSON.parse(body);
    const translate=source=>source==='Batch bad source'?null:source==='Repeat error source'?'相'.repeat(100):source==='Accuracy improved from 0.66 to 0.91.'?'准确率从0.66提高到0.19。':source.startsWith('HRCoach:')?'HRCoach：面向人机协作的故障恢复':'人机协作采用标称阻抗检测故障。';
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({translatedText:Array.isArray(q)?q.map(translate):translate(q)}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',`
      import assert from 'node:assert/strict';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
      const db=new DatabaseSync(path.join(process.env.DATA_DIR,'translation-cache.db'));
      db.exec('CREATE TABLE translations(hash TEXT PRIMARY KEY,source TEXT NOT NULL,translated TEXT NOT NULL,updated_at TEXT NOT NULL)');
      db.prepare('INSERT INTO translations VALUES (?,?,?,?)').run('legacy-v1','Human-robot collaboration uses nominal impedance.','相'.repeat(100),'2026-11-25');db.close();
      const {localizePaper}=await import('./server/localizePaper.ts');const {translateChinese,translateChineseBatch}=await import('./server/translation.ts');
      const {TRANSLATION_VERSION}=await import('./server/translationQuality.ts');
      const p={title:'HRCoach: Human-robot collaboration and recovery',titleZh:'',digestSummary:'',tags:[],keywords:[],anatomy:{background:'相'.repeat(100),modelName:'人权利'}};
      const fixed=await localizePaper(p);
      assert.equal(fixed.anatomy.background,'人机协作采用标称阻抗检测故障。');
      assert.equal(fixed.anatomy.modelName,'HRCoach');assert.equal(fixed.localization.status,'complete');
      assert.equal(fixed.localization.version,TRANSLATION_VERSION);
      assert.equal(fixed.localization.fields['anatomy.background'].source,'Human-robot collaboration uses nominal impedance.');
      fixed.anatomy.background='研究团队人工校对并保存的中文段落。';
      const edited=await localizePaper(fixed);assert.equal(edited.anatomy.background,fixed.anatomy.background);
      assert.equal(await translateChinese('Repeat error source'),null);
      assert.equal(await translateChinese('Accuracy improved from 0.66 to 0.91.'),null);
      assert.deepEqual(await translateChineseBatch(['Batch valid source','Batch bad source']),['人机协作采用标称阻抗检测故障。',null]);
      const cache=new DatabaseSync(path.join(process.env.DATA_DIR,'translation-cache.db'));
      assert.equal(cache.prepare("SELECT COUNT(*) n FROM translations WHERE source='Repeat error source'").get().n,0);cache.close();
    `],{env:{...process.env,DATA_DIR:dir,LOCAL_TRANSLATION_URL:`http://127.0.0.1:${server.address().port}/translate`},stdio:['ignore','pipe','pipe']});
    let logs='';child.stderr.on('data',b=>logs+=b);
    const code=await new Promise(r=>child.once('exit',r));assert.equal(code,0,logs);
  }finally {
    await new Promise(r=>server.close(r));
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));assert.ok(path.basename(dir).startsWith('paperpulse-quality-'));
    await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
