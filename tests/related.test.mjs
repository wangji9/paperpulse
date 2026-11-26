import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('content recommendations exclude collected duplicates and provide real evidence; lab statistics use only lab entries',()=>{
  const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {relatedPapers} from './src/lib/relatedPapers.ts';
    import {analyzeLab} from './src/lib/labAnalysis.ts';
    const make=(id,title,topics,doi='')=>({id,title,titleZh:title,abstractOriginal:title,keywordsOriginal:[],keywords:[],topics,doi,citations:[],publishedDate:'2026',authors:['Author A'],journal:'Real Journal'});
    const seed=make('seed','Multimodal knowledge graph reasoning for industrial faults',['KnowledgeGraph','Multimodal'],'10.1/seed');
    const match=make('match','Multimodal knowledge graph reasoning for manufacturing faults',['KnowledgeGraph','Multimodal']);
    const unrelated=make('other','Cancer clinical randomized therapeutic trial',['ProductDesign']);
    const duplicate=make('dup',seed.title,seed.topics,'https://doi.org/10.1/seed');
    const result=relatedPapers([seed],[seed,match,unrelated,duplicate]);
    assert.equal(result[0].paper.id,'match');assert.ok(result[0].reasons.some(r=>r.includes('共同方向')));
    assert.ok(!result.some(r=>['seed','dup','other'].includes(r.paper.id)));
    assert.deepEqual(relatedPapers([], [seed,match]),[]);
    const a=analyzeLab([{paper:seed,publicationYear:2027}]);
    assert.equal(a.papers.length,1);assert.deepEqual(a.yearCounts,[{year:2027,count:1}]);assert.equal(a.journals[0][1],1);
    assert.ok(a.pairs.every(pair=>pair.papers.every(p=>p.id==='seed')));
  `],{encoding:'utf8'});
  assert.equal(child.status,0,child.stdout+child.stderr);
});
