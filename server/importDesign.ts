import { DESIGN_JOURNAL_SOURCES, fetchLatestDesignPapers, rawToAcademicPaper } from './liveFetcher.js';
import { getAutoSyncConfig, getDatabaseStats, initDatabase, isPaperSuppressed, listPapers, paperExistsByTitleOrDoi, recordSyncLog, upsertPaper } from './db.js';

// Explicit initial import of verified journal metadata. Scheduled updates use the same sources.
initDatabase();
const existingJournals = new Set(listPapers().map(p => p.journalShort));
const missingSources = DESIGN_JOURNAL_SOURCES.filter(s => !existingJournals.has(s.short)).map(s => s.short);
const candidates = await fetchLatestDesignPapers(365, missingSources);
let added = 0;
const journals = new Set<string>();
for (const raw of candidates) {
  if (journals.has(raw.journalShort) || added >= 7) continue;
  if (paperExistsByTitleOrDoi(raw.title, raw.doi) || isPaperSuppressed(raw.title, raw.doi)) continue;
  if (getDatabaseStats().totalPapers >= (getAutoSyncConfig().maxStoredPapers || 1000)) break;
  const paper = await rawToAcademicPaper(raw);
  upsertPaper(paper);
  journals.add(raw.journalShort); added++;
  console.log(`${raw.journalShort}: ${raw.title} | ${raw.doi}`);
}
recordSyncLog('design_journals_initial_import', added, '从OpenAlex核实的设计期刊来源导入最近一年文献，每个来源最多一篇；缺少摘要时不生成研究结论。');
console.log(`Added ${added} verified journal papers.`);
