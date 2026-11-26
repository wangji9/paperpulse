import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper, LabEntry, UserProfile } from '../src/types/paper.js';
import { getPaperById, listPapers, upsertPaper } from './db.js';
import { buildStructuredAnatomy, detectDataset, detectDomain, detectTopics, resolveJournalShort, type RawExternalPaper } from './liveFetcher.js';
import { extractKeywords } from './keywords.js';
import { applySourceText } from './sourceText.js';
import { localizeStoredPaper } from './localizationQueue.js';
import { extractUploadedPdf } from './uploadedPdf.js';
import { extractOriginalPaperMedia } from './paperMediaExtractor.js';
import { localizePaper } from './localizePaper.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const PAPER_ASSETS_DIR = path.join(DATA_DIR, 'paper-assets');
const db=new DatabaseSync(path.resolve(process.env.DATA_DIR||'data','paperpulse.db'));
db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS lab_papers(
 paper_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, added_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, source TEXT NOT NULL, citation TEXT NOT NULL,
 publication_year INTEGER, notes TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}');`);
type Row={paper_id:string;owner_id:string;added_at:string;updated_at:string;source:string;citation:string;publication_year:number|null;notes:string;metadata:string};
export function listLabEntries(user:UserProfile):LabEntry[] {
  const papers=new Map(listPapers({},user.id).map(p=>[p.id,p]));
  return (db.prepare('SELECT * FROM lab_papers ORDER BY publication_year DESC, added_at DESC').all() as Row[]).flatMap(r=>{
    const p=papers.get(r.paper_id);if(!p)return [];
    const metadata=JSON.parse(r.metadata);
    if(Object.keys(metadata).some(k=>['title','abstractOriginal','keywords'].includes(k)))metadata.topics=detectTopics(`${metadata.title||p.title} ${metadata.abstractOriginal||p.abstractOriginal} ${(metadata.keywords||p.keywords||[]).join(' ')}`,false);
    return [{paperId:r.paper_id,ownerId:r.owner_id,addedAt:r.added_at,updatedAt:r.updated_at,source:r.source,citation:r.citation,publicationYear:r.publication_year||undefined,notes:r.notes,metadata,paper:{...p,...metadata,labMetadata:metadata},canEdit:user.role==='admin'||r.owner_id===user.id}];
  });
}
export function addLabPaper(paperId:string,user:UserProfile,info:{source?:string;citation?:string;publicationYear?:number}={}):void {
  if(!getPaperById(paperId))throw new Error('文献不存在');
  const now=new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO lab_papers(paper_id,owner_id,added_at,updated_at,source,citation,publication_year) VALUES(?,?,?,?,?,?,?)').run(paperId,user.id,now,now,info.source||'成员主动归档',info.citation||'',info.publicationYear||null);
}
export function createManualLabPaper(user:UserProfile,body:Record<string,unknown>):LabEntry[] {
  const title=String(body.title||'').trim();
  const journal=String(body.journal||'').trim();
  const authorsRaw=Array.isArray(body.authors)?body.authors.map(s=>String(s).trim()).filter(Boolean):String(body.authors||'').split(/[;；]/).map(s=>s.trim()).filter(Boolean);
  if(!title||!journal||!authorsRaw.length)throw Object.assign(new Error('请完整填写论文标题、作者与发表期刊/会议'),{status:400});
  const titleZh=String(body.titleZh||title).trim();
  const doi=String(body.doi||'').trim();
  const abstractOriginal=String(body.abstractOriginal||'').trim();
  const abstractZh=String(body.abstractZh||'').trim();
  const keywordsRaw=Array.isArray(body.keywords)?body.keywords.map(s=>String(s).trim()).filter(Boolean):String(body.keywords||'').split(/[;；,，]/).map(s=>s.trim()).filter(Boolean);
  const yearNum=Number(body.publicationYear)||new Date().getFullYear();
  if(!Number.isInteger(yearNum)||yearNum<1900||yearNum>2100)throw Object.assign(new Error('发表年份不正确'),{status:400});
  const notes=String(body.notes||'').slice(0,10000);
  const keyStr=(doi||title).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const id=`lab-${createHash('sha256').update(keyStr).digest('hex').slice(0,24)}`;
  const existing=getPaperById(id);
  if(!existing){
    const raw:RawExternalPaper={
      title,abstract:abstractOriginal||abstractZh,authors:authorsRaw,affiliations:[],journal,
      journalShort:resolveJournalShort(journal).short,publishedDate:String(yearNum),doi,
      url:doi?`https://doi.org/${doi}`:'',citedByCount:0,citations:[],sourceOrigin:'user_created',
    };
    const structure=buildStructuredAnatomy(raw,null);
    const paper:AcademicPaper=applySourceText({
      id,...raw,titleZh,syncedAt:new Date().toISOString(),
      topics:detectTopics(`${title} ${abstractOriginal} ${abstractZh} ${keywordsRaw.join(' ')}`,false),
      domain:detectDomain(`${title} ${abstractOriginal} ${abstractZh}`,journal),
      journalRank:'',abstractOriginal,abstractZh:abstractZh||undefined,
      digestSummary:structure.digestSummary,tags:structure.tags,
      keywords:keywordsRaw.length?keywordsRaw:extractKeywords(title,abstractOriginal||abstractZh),
      keywordsOriginal:keywordsRaw.length?keywordsRaw:undefined,
      keywordSource:keywordsRaw.length?'author':'extracted',
      anatomy:structure.anatomy,readingStatus:'unread',isBookmarked:false,comments:[],
      parsing:{status:abstractOriginal||abstractZh?'abstract':'metadata',updatedAt:new Date().toISOString(),sections:abstractOriginal||abstractZh?['abstract']:[],warnings:abstractOriginal||abstractZh?[]:['尚未提供摘要，可点击修订或上传原文PDF补全。']},
    },abstractOriginal||abstractZh);
    upsertPaper(paper,user.id);
    if(abstractOriginal&&!abstractZh&&process.env.LOCAL_TRANSLATION_URL)void localizeStoredPaper(paper).catch(()=>{});
  }
  addLabPaper(id,user,{source:`成员手动录入 (${user.displayName})`,citation:`${authorsRaw.join(', ')} (${yearNum}). ${title}. ${journal}.`,publicationYear:yearNum});
  if(notes)changeLabEntry(id,user,{notes});
  return listLabEntries(user);
}
export async function attachPaperPdfAndParse(
  id: string,
  user: UserProfile,
  pdfBuffer: Buffer,
  fileName = 'paper.pdf'
): Promise<AcademicPaper> {
  if (!pdfBuffer.length || pdfBuffer.length > 32 * 1024 * 1024) {
    throw Object.assign(new Error('PDF 文件大小需在 1 字节至 32MB 之间'), { status: 413 });
  }
  if (pdfBuffer.subarray(0, 1024).indexOf('%PDF-') < 0) {
    throw Object.assign(new Error('请上传有效的 PDF 文件'), { status: 400 });
  }
  const existing = getPaperById(id, user.id);
  if (!existing) throw Object.assign(new Error('文献记录不存在'), { status: 404 });

  const dir = path.join(PAPER_ASSETS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'source.pdf');
  fs.writeFileSync(target, pdfBuffer);
  const localPdfUrl = `/paper-assets/${id}/source.pdf`;

  let nextPaper: AcademicPaper = {
    ...existing,
    localPdfUrl,
    upload: {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      fileName: fileName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'paper.pdf',
      uploadedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(pdfBuffer).digest('hex'),
    },
  };

  try {
    const evidence = await extractUploadedPdf(target);
    const extractedAbstract = (evidence.sections.abstract || '')
      .replace(/-\n(?=[a-z])/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 7000);
    const abstractOriginal =
      extractedAbstract.length > (existing.abstractOriginal || '').trim().length
        ? extractedAbstract
        : existing.abstractOriginal || extractedAbstract;

    const bodySections = Object.entries(evidence.sections)
      .filter(([k]) => !/reference|acknowledg|appendix/.test(k))
      .map(([, v]) => v);
    const context = [
      existing.title,
      abstractOriginal,
      ...(bodySections.length ? bodySections : [evidence.text.slice(0, 20000)]),
    ]
      .join(' ')
      .slice(0, 35000);

    nextPaper = applySourceText(
      {
        ...nextPaper,
        abstractOriginal,
        digestSummary: existing.digestSummary || abstractOriginal.slice(0, 1200),
        keywords:
          existing.keywords && existing.keywords.length >= 3
            ? existing.keywords
            : extractKeywords(existing.title, abstractOriginal || context, evidence.keywords),
        topics: existing.topics?.length ? existing.topics : detectTopics(context, false),
        domain: existing.domain || detectDomain(context, existing.journal),
      },
      evidence.text,
      evidence.sections
    );

    const ds = detectDataset(context);
    if (nextPaper.anatomy.dataset.sourceType === 'unspecified' && ds.type !== 'unspecified') {
      nextPaper.anatomy.dataset = {
        ...nextPaper.anatomy.dataset,
        sourceType: ds.type,
        names: ds.names.length ? ds.names : nextPaper.anatomy.dataset.names,
        summary: ds.summary || nextPaper.anatomy.dataset.summary,
      };
    }

    const readable = evidence.text.trim().length >= 100;
    nextPaper.parsing = {
      status: readable ? 'full_text' : 'metadata',
      updatedAt: new Date().toISOString(),
      sourceUrl: localPdfUrl,
      pages: evidence.pages,
      sections: Object.keys(evidence.sections),
      warnings: evidence.warnings || [],
    };
  } catch (err) {
    console.error('[单篇PDF正文解析]', id, err);
    nextPaper.parsing = {
      ...(nextPaper.parsing || { status: 'metadata', sections: [], warnings: [] }),
      updatedAt: new Date().toISOString(),
      sourceUrl: localPdfUrl,
      warnings: [...(nextPaper.parsing?.warnings || []), '已保存原文 PDF，正文文本提取受限，可直接在线阅读全文。'],
    };
  }

  try {
    const media = await extractOriginalPaperMedia(nextPaper);
    if (media.paperFigures.length) nextPaper.anatomy.paperFigures = media.paperFigures;
    if (media.paperTables.length) nextPaper.anatomy.paperTables = media.paperTables;
  } catch (err) {
    console.error('[单篇PDF图表提取]', id, err);
  }

  try {
    nextPaper = await localizePaper(nextPaper);
  } catch (err) {
    console.error('[单篇PDF中文翻译]', id, err);
  }

  return upsertPaper(nextPaper, user.id);
}

export async function attachLabPaperPdf(
  id: string,
  user: UserProfile,
  pdfBuffer: Buffer,
  fileName?: string
): Promise<{ entries: LabEntry[]; paper: AcademicPaper }> {
  const row = db.prepare('SELECT * FROM lab_papers WHERE paper_id=?').get(id) as Row | undefined;
  if (!row) throw Object.assign(new Error('课题组文献不存在'), { status: 404 });
  const paper = await attachPaperPdfAndParse(id, user, pdfBuffer, fileName);
  db.prepare('UPDATE lab_papers SET updated_at=? WHERE paper_id=?').run(new Date().toISOString(), id);
  return { entries: listLabEntries(user), paper };
}
export function changeLabEntry(id:string,user:UserProfile,body:Record<string,unknown>,remove=false):void {
  const row=db.prepare('SELECT * FROM lab_papers WHERE paper_id=?').get(id) as Row|undefined;
  if(!row)throw Object.assign(new Error('课题组文献不存在'),{status:404});
  if(user.role!=='admin'&&row.owner_id!==user.id)throw Object.assign(new Error('只能管理自己归档的课题组条目'),{status:403});
  if(remove){db.prepare('DELETE FROM lab_papers WHERE paper_id=?').run(id);return;}
  const meta=JSON.parse(row.metadata) as LabEntry['metadata'];
  for(const k of ['title','titleZh','journal','abstractOriginal','abstractZh','doi'] as const) {
    if(body[k]!==undefined){if(typeof body[k]!=='string'||(body[k] as string).length>15000)throw Object.assign(new Error('文献字段格式或长度不正确'),{status:400});meta[k]=(body[k] as string).trim();}
  }
  for(const k of ['authors','keywords'] as const)if(body[k]!==undefined){
    if(!Array.isArray(body[k])||(body[k] as unknown[]).length>100||(body[k] as unknown[]).some(s=>typeof s!=='string'||s.length>300))throw Object.assign(new Error('作者或关键词格式不正确'),{status:400});
    meta[k]=(body[k] as string[]).map(s=>s.trim()).filter(Boolean);
  }
  const year=body.publicationYear===undefined?row.publication_year:Number(body.publicationYear)||null;
  if(year!==null&&(!Number.isInteger(year)||year<1900||year>2100))throw Object.assign(new Error('发表年份不正确'),{status:400});
  const notes=body.notes===undefined?row.notes:String(body.notes).slice(0,10000);
  db.prepare('UPDATE lab_papers SET metadata=?,notes=?,publication_year=?,updated_at=? WHERE paper_id=?').run(JSON.stringify(meta),notes,year,new Date().toISOString(),id);
}
