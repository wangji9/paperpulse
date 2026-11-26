import type { AcademicPaper, ResearchTopic } from '../types/paper';
import { TOPIC_META } from './constants';
import {
  buildDynamicAuthorMap,
  dedupePaperAuthors,
  extractCanonicalPaperKeywords,
  type CanonicalKeywordInfo,
} from './canonicalize';

export interface RelatedScoreBreakdown {
  semantic: number;     // 0..100 TF-IDF title + abstract cosine
  topic: number;        // 0..100 shared research topics
  keyword: number;      // 0..100 shared bilingual canonical keywords
  author: number;       // 0..100 shared canonical authors
  citation: number;     // 0 or 100 direct citation link
}

export interface RelatedMatch {
  paper: AcademicPaper;
  score: number;
  reasons: string[];
  seedIds: string[];
  sharedTopics: ResearchTopic[];
  sharedKeywords: CanonicalKeywordInfo[];
  sharedAuthors: string[];
  hasCitationLink: boolean;
  breakdown: RelatedScoreBreakdown;
}

const stop = new Set(
  'the and for with from this that using based approach method study via towards of in to a an on by as is are we it or at our into their can be has have was were which such also more than used'.split(
    ' '
  )
);

function terms(p: AcademicPaper, canonicalKws: CanonicalKeywordInfo[]): Map<string, number> {
  const result = new Map<string, number>();
  const add = (s: string, w: number) => {
    for (const t of s.normalize('NFKC').toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\u3400-\u9fff]{2,6}/g) || []) {
      if (!stop.has(t)) result.set(t, (result.get(t) || 0) + w);
    }
  };
  add(p.title || '', 3);
  if (p.titleZh && p.titleZh !== p.title) add(p.titleZh, 2.5);
  add(p.abstractOriginal || '', 1.2);
  if (p.abstractZh) add(p.abstractZh, 1.0);
  add((p.keywordsOriginal || p.keywords || []).join(' '), 4);
  // Inject bilingual canonical concept IDs so Chinese & English papers on the same topic align cleanly!
  for (const kw of canonicalKws) {
    result.set(`__concept_${kw.id}`, (result.get(`__concept_${kw.id}`) || 0) + 4.5);
  }
  return result;
}

const cleanDoi = (p: AcademicPaper) =>
  (p.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase();

export function relatedPapers(seeds: AcademicPaper[], pool: AcademicPaper[], limit = 10): RelatedMatch[] {
  if (!seeds.length) return [];

  const corpus = [...new Map([...seeds, ...pool].map((p) => [p.id, p])).values()];
  const dynAuthors = buildDynamicAuthorMap(corpus.flatMap((p) => p.authors || []));
  const kwMap = new Map(corpus.map((p) => [p.id, extractCanonicalPaperKeywords(p)]));
  const authorMap = new Map(corpus.map((p) => [p.id, dedupePaperAuthors(p.authors || [], dynAuthors)]));

  const vectors = new Map(corpus.map((p) => [p.id, terms(p, kwMap.get(p.id) || [])]));
  const df = new Map<string, number>();
  vectors.forEach((v) => v.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)));
  vectors.forEach((v) =>
    v.forEach((n, k) => v.set(k, (1 + Math.log(n)) * Math.log(1 + corpus.length / (df.get(k) || 1))))
  );

  const cosine = (a: Map<string, number>, b: Map<string, number>) => {
    let dot = 0;
    for (const [k, v] of a) dot += v * (b.get(k) || 0);
    const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, n) => s + n * n, 0));
    return dot / (norm(a) * norm(b) || 1);
  };

  const seedIds = new Set(seeds.map((p) => p.id));
  const seedDois = new Set(seeds.map(cleanDoi).filter(Boolean));
  const seen = new Set<string>();

  return pool
    .flatMap((p) => {
      const pDoi = cleanDoi(p);
      const unique = pDoi || (p.title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (seedIds.has(p.id) || (pDoi && seedDois.has(pDoi)) || seen.has(unique)) return [];
      seen.add(unique);

      const pKws = kwMap.get(p.id) || [];
      const pKwIds = new Set(pKws.map((k) => k.id));
      const pAuthors = authorMap.get(p.id) || [];
      const pAuthorIds = new Set(pAuthors.map((a) => a.id));

      const evaluated = seeds
        .map((seed) => {
          const sTopics = (seed.topics || []).filter((t) => (p.topics || []).includes(t));
          const sKws = (kwMap.get(seed.id) || []).filter((k) => pKwIds.has(k.id));
          const sAuthors = (authorMap.get(seed.id) || [])
            .filter((a) => pAuthorIds.has(a.id))
            .map((a) => a.shortName);
          const sDoi = cleanDoi(seed);
          const citation =
            (seed.citations || []).some((c) => (c.doi && c.doi.toLowerCase() === pDoi) || c.id === p.id) ||
            (p.citations || []).some((c) => (c.doi && sDoi && c.doi.toLowerCase() === sDoi) || c.id === seed.id);
          const text = cosine(vectors.get(seed.id)!, vectors.get(p.id)!);

          const reasons: string[] = [
            ...(text > 0.08 ? ['题名与摘要语义高度相近'] : []),
            ...sTopics.map((t) => `共同方向：${TOPIC_META[t]?.label || t}`),
            ...sKws.slice(0, 3).map((k) => `共享概念：${k.label}`),
            ...sAuthors.slice(0, 2).map((a) => `共同作者：${a}`),
            ...(citation ? ['存在直接引文关联'] : []),
          ];

          const score = Math.min(
            0.99,
            text * 0.62 +
              Math.min(sTopics.length, 3) * 0.055 +
              Math.min(sKws.length, 4) * 0.045 +
              Math.min(sAuthors.length, 2) * 0.05 +
              (citation ? 0.16 : 0)
          );

          const breakdown: RelatedScoreBreakdown = {
            semantic: Math.min(100, Math.round(text * 165)),
            topic: Math.min(100, Math.round((sTopics.length / Math.max(seed.topics?.length || 1, 1)) * 100)),
            keyword: Math.min(100, Math.round((Math.min(sKws.length, 4) / 4) * 100)),
            author: Math.min(100, Math.round((Math.min(sAuthors.length, 2) / 2) * 100)),
            citation: citation ? 100 : 0,
          };

          return {
            score,
            reasons,
            seedId: seed.id,
            sharedTopics: sTopics,
            sharedKeywords: sKws,
            sharedAuthors: sAuthors,
            hasCitationLink: citation,
            breakdown,
          };
        })
        .sort((a, b) => b.score - a.score);

      const top = evaluated[0];
      if (!top || !top.reasons.length || top.score < 0.07) return [];

      return [
        {
          paper: p,
          score: top.score,
          reasons: top.reasons,
          seedIds: evaluated
            .filter((b) => b.score >= 0.07 && b.reasons.length)
            .slice(0, 3)
            .map((b) => b.seedId),
          sharedTopics: top.sharedTopics,
          sharedKeywords: top.sharedKeywords,
          sharedAuthors: top.sharedAuthors,
          hasCitationLink: top.hasCitationLink,
          breakdown: top.breakdown,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || (b.paper.publishedDate || '').localeCompare(a.paper.publishedDate || ''))
    .slice(0, limit);
}
