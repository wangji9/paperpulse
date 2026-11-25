import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('table repair removes embedded pages while retaining real cells and safe local figures', () => {
  const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
    import {sanitizePaperTableHtml} from './server/tableSafety.ts';
    console.log(JSON.stringify(sanitizePaperTableHtml('<table><tr><td rowspan="2">Accuracy</td><td>94.2</td></tr><tr><td><object type="image/svg+xml" data="2201.05843v1/x11.svg"></object><iframe src="/"></iframe><img src="javascript:alert(1)" onerror="alert(1)"><img src="/paper-assets/test/table.png"><script>alert(1)</script></td></tr></table>')));
  `],{encoding:'utf8'});
  const html=JSON.parse(output);
  assert.match(html,/94\.2/);
  assert.match(html,/rowspan="2"/);
  assert.match(html,/\/paper-assets\/test\/table.png/);
  assert.doesNotMatch(html,/object|iframe|javascript|onerror|script|2201\.05843/);
});

test('official proceedings metadata validates year and source extraction does not invent results', () => {
  const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
    import {parseConferencePage} from './server/conferenceFetcher.ts';
    import {extractKeywords} from './server/keywords.ts';
    import {applySourceText} from './server/sourceText.ts';
    const html='<html><head><meta name="citation_title" content="Graph Agent Reasoning"><meta name="citation_publication_date" content="2026"><meta name="citation_author" content="A. Author"><meta name="citation_pdf_url" content="/papers/agent.pdf"></head><body><div class="acl-abstract">Abstract: We propose a graph agent for document reasoning.</div></body></html>';
    const raw=parseConferencePage(html,'https://aclanthology.org/2026.acl-long.1/','ACL',2026);
    const mismatch=parseConferencePage(html,'https://aclanthology.org/2026.acl-long.1/','ACL',2025);
    const paper={abstractOriginal:raw.abstract, anatomy:{comparisonMetrics:{rows:[{fabricated:true}]},ablationStudy:{items:[{fabricated:true}]}}};
    const parsed=applySourceText(paper,raw.abstract);
    console.log(JSON.stringify({raw,mismatch,parsed,keywords:extractKeywords(raw.title,raw.abstract,['多智能体'])}));
  `],{encoding:'utf8'});
  const {raw,mismatch,parsed,keywords}=JSON.parse(output);
  assert.equal(raw.publishedDate,'2026');
  assert.equal(raw.pdfUrl,'https://aclanthology.org/papers/agent.pdf');
  assert.ok(raw.abstract.includes('We propose'));
  assert.equal(mismatch,null);
  assert.equal(parsed.anatomy.conclusion,'');
  assert.equal(parsed.anatomy.comparisonMetrics.hasQuantitativeData,false);
  assert.deepEqual(parsed.anatomy.ablationStudy.items,[]);
  assert.ok(keywords.includes('多智能体'));
  assert.ok(keywords.length>2);
});
