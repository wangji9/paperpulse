import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('design topics and multi-agent versus human-AI topics stay distinct', () => {
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { detectTopics, resolveJournalShort } from './server/liveFetcher.ts';
    console.log(JSON.stringify({
      human: detectTopics('Human-AI collaboration in product design and user experience'),
      multi: detectTopics('Multi-agent team collaboration for topology optimization and sustainable design'),
      journal: resolveJournalShort('Journal of Mechanical Design', 'https://openalex.org/S88457320')
    }));
  `], { encoding: 'utf8' });
  const data = JSON.parse(output);
  assert.ok(data.human.includes('HumanAICollaboration'));
  assert.ok(data.human.includes('ProductDesign'));
  assert.ok(data.human.includes('InteractionDesign'));
  assert.equal(data.human.includes('AgentCollaboration'), false);
  assert.ok(data.multi.includes('AgentCollaboration'));
  assert.ok(data.multi.includes('DesignOptimization'));
  assert.ok(data.multi.includes('SustainableDesign'));
  assert.equal(data.multi.includes('HumanAICollaboration'), false);
  assert.equal(data.journal.short, 'JMD');
});
