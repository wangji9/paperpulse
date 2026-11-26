import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { AcademicPaper, LabEntry, UserProfile } from '../src/types/paper.js';
import { getPaperById, listPapers } from './db.js';
import { detectTopics } from './liveFetcher.js';

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
