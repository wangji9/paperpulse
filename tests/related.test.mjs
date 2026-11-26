import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('content recommendations exclude collected duplicates, merge bilingual concepts, and lab analytics deduplicate authors & discover research gaps', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { relatedPapers } from './src/lib/relatedPapers.ts';
    import { analyzeLab } from './src/lib/labAnalysis.ts';
    import { canonicalizeAuthor, canonicalizeKeyword } from './src/lib/canonicalize.ts';

    // 1. Bilingual author deduplication & official lab roster names
    assert.equal(canonicalizeAuthor('李心雨*').id, canonicalizeAuthor('Xinyu Li').id);
    assert.equal(canonicalizeAuthor('Li, X.*').id, canonicalizeAuthor('Xin-Yu Li').id);
    assert.equal(canonicalizeAuthor('鲍劲松').id, canonicalizeAuthor('Bao, J.').id);
    assert.equal(canonicalizeAuthor('Weibin Zhuang').shortName, '庄炜斌');
    assert.equal(canonicalizeAuthor('Cong Jiang').shortName, '蒋聪');
    assert.equal(canonicalizeAuthor('Congmao Chen').shortName, '陈丛茂');
    assert.equal(canonicalizeAuthor('Hongji Yi').cohort, '2026级 博士');
    assert.notEqual(canonicalizeAuthor('Xinyu Li').id, canonicalizeAuthor('Xinyu Pan').id);

    // 2. Bilingual keyword deduplication
    assert.equal(canonicalizeKeyword('知识图谱')?.id, canonicalizeKeyword('Knowledge Graph')?.id);
    assert.equal(canonicalizeKeyword('Large Language Models')?.id, canonicalizeKeyword('大语言模型')?.id);
    assert.equal(canonicalizeKeyword('大型语言模型')?.id, canonicalizeKeyword('大语言模型')?.id);
    assert.equal(canonicalizeKeyword('Agentic AI')?.id, canonicalizeKeyword('多智能体')?.id);

    // 3. Related papers ranking & cross-language matching
    const make = (id, title, topics, doi = '', authors = ['Xinyu Li'], kws = []) => ({
      id, title, titleZh: title, abstractOriginal: title, keywordsOriginal: kws, keywords: kws,
      topics, doi, citations: [], publishedDate: '2026', authors, journal: 'Real Journal'
    });
    const seed = make('seed', 'Multimodal knowledge graph reasoning for industrial faults', ['KnowledgeGraph', 'Multimodal'], '10.1/seed', ['Xinyu Li'], ['Knowledge Graph']);
    const match = make('match', 'Multimodal knowledge graph reasoning for manufacturing faults', ['KnowledgeGraph', 'Multimodal'], '', ['李心雨*'], ['知识图谱']);
    const unrelated = make('other', 'Cancer clinical randomized therapeutic trial', ['ProductDesign'], '', ['Other Person']);
    const duplicate = make('dup', seed.title, seed.topics, 'https://doi.org/10.1/seed');

    const result = relatedPapers([seed], [seed, match, unrelated, duplicate]);
    assert.equal(result[0].paper.id, 'match');
    assert.ok(result[0].reasons.some((r) => r.includes('共同方向')));
    assert.ok(result[0].sharedAuthors.includes('李心雨'));
    assert.ok(result[0].sharedKeywords.length >= 1);
    assert.ok(!result.some((r) => ['seed', 'dup', 'other'].includes(r.paper.id)));
    assert.deepEqual(relatedPapers([], [seed, match]), []);

    // 4. Lab analytics deduplication & gap matrix
    const a = analyzeLab([
      { paper: seed, publicationYear: 2027 },
      { paper: match, publicationYear: 2026 },
    ]);
    assert.equal(a.papers.length, 2);
    assert.equal(a.canonicalAuthors.length, 1);
    assert.equal(a.canonicalAuthors[0].count, 2);
    assert.deepEqual(a.yearCounts.map(({ year, count }) => ({ year, count })), [{ year: 2026, count: 1 }, { year: 2027, count: 1 }]);
    assert.equal(a.journals[0][1], 2);
    assert.ok(a.pairs.every((pair) => pair.papers.every((p) => ['seed', 'match'].includes(p.id))));
    assert.ok(a.techDomainMatrix.length > 0);
  `,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
