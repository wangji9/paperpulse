import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PdfImportJob, UserProfile, AcademicPaper } from '../src/types/paper.js';
import { getAutoSyncConfig, getPaperById, isPaperSuppressed, listAllUsers, listPapers, recordSyncLog, upsertPaper, upsertUserKbItem } from './db.js';
import { extractUploadedPdf, buildUploadedPaper } from './uploadedPdf.js';
import { extractOriginalPaperMedia, PAPER_ASSETS_DIR } from './paperMediaExtractor.js';
import { getPaddleParserUrl, parsePdfWithBaiduService } from './paddleParser.js';
import { localizePaper } from './localizePaper.js';
import { addLabPaper } from './labLibrary.js';

const root=path.resolve(process.env.DATA_DIR||'data','pdf-imports');
fs.mkdirSync(root,{recursive:true});
const jobs=new DatabaseSync(path.join(root,'jobs.db'));
jobs.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL)`);
type InternalJob=PdfImportJob & {user:UserProfile;sha256:string;addToMyKb:boolean};
let running=false;
const read=(id:string):InternalJob|undefined=>{
  const row=jobs.prepare('SELECT payload FROM imports WHERE id=?').get(id) as {payload:string}|undefined;
  return row?JSON.parse(row.payload):undefined;
};
function save(job:InternalJob):void {
  // A second upload can promote an active public import into the lab library.
  // Do not lose that durable destination on the worker's next phase update.
  if(read(job.id)?.destination==='lab')job.destination='lab';
  job.updatedAt=new Date().toISOString();
  jobs.prepare('INSERT OR REPLACE INTO imports VALUES (?,?,?,?,?)').run(job.id,job.user.id,job.status,job.createdAt,JSON.stringify(job));
}
function publicJob(job:InternalJob):PdfImportJob {
  const {user:_u,sha256:_s,addToMyKb:_k,...safe}=job;return safe;
}
export function getPdfImportJob(id:string,user:UserProfile):PdfImportJob|undefined {
  const job=read(id);
  return job && (job.user.id===user.id || user.role==='admin')?publicJob(job):undefined;
}
export function listPdfImportJobs(user:UserProfile):PdfImportJob[] {
  const rows=(user.role==='admin'?jobs.prepare('SELECT payload FROM imports ORDER BY created_at DESC LIMIT 20').all():jobs.prepare('SELECT payload FROM imports WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(user.id)) as Array<{payload:string}>;
  return rows.map(r=>publicJob(JSON.parse(r.payload)));
}
const incoming=(id:string)=>path.join(root,id+'.pdf');
export class PdfUploadError extends Error {constructor(message:string,public status:number){super(message);}}
export function enqueuePdf(buffer:Buffer,fileName:string,user:UserProfile,addToMyKb:boolean,destination:'pool'|'lab'='pool'):PdfImportJob {
  if(!buffer.length || buffer.length>32*1024*1024)throw new PdfUploadError('PDF大小需要在1字节至32MB之间',413);
  if(buffer.subarray(0,1024).indexOf('%PDF-')<0)throw new PdfUploadError('文件不是有效的PDF文档',415);
  const hash=createHash('sha256').update(buffer).digest('hex');
  const current=jobs.prepare("SELECT payload FROM imports WHERE user_id=? AND status IN ('queued','processing')").all(user.id) as Array<{payload:string}>;
  for(const row of current) {const prior:InternalJob=JSON.parse(row.payload);if(prior.sha256===hash){if(destination==='lab'){prior.destination='lab';save(prior);}return publicJob(prior);}}
  if(current.length>=3)throw new PdfUploadError('您已有3个待处理任务，请等待解析完成后再上传',429);
  const active=Number((jobs.prepare("SELECT COUNT(*) AS n FROM imports WHERE status IN ('queued','processing')").get() as {n:number}).n);
  if(active>=24)throw new PdfUploadError('解析队列繁忙，请稍后上传',429);
  if(listPapers().length+active>=(getAutoSyncConfig().maxStoredPapers||1000))throw new PdfUploadError('公共文献池已达到容量上限，请联系管理员清理或调整上限',409);
  const now=new Date().toISOString();
  const job:InternalJob={id:randomUUID(),user,sha256:hash,fileName:fileName.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,200)||'上传文献.pdf',status:'queued',phase:'排队等待解析',createdAt:now,updatedAt:now,addToMyKb};
  job.destination=destination;
  fs.writeFileSync(incoming(job.id),buffer,{flag:'wx'});
  try {save(job);}catch(error){fs.unlinkSync(incoming(job.id));throw error;}
  setImmediate(()=>{void drain();});
  return publicJob(job);
}
function duplicate(paper:AcademicPaper):AcademicPaper|undefined {
  const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  return listPapers().find(p=>p.upload?.sha256===paper.upload?.sha256 || (paper.doi && p.doi.toLowerCase()===paper.doi.toLowerCase()) || (!paper.upload?.titleFromFileName && !p.upload?.titleFromFileName && key(p.title)===key(paper.title)));
}
async function processJob(job:InternalJob):Promise<void> {
  const phase=(text:string)=>{job.status='processing';job.phase=text;save(job);};
  let paperDir:string|undefined,committed=false;
  try {
    const id='pdf-'+job.sha256.slice(0,24);
    const urlPrefix=`/paper-assets/${id}`;
    paperDir=path.join(PAPER_ASSETS_DIR,id);
    fs.mkdirSync(paperDir,{recursive:true});
    const sourcePdf=path.join(paperDir,'source.pdf');
    fs.copyFileSync(incoming(job.id),sourcePdf);

    // Single-pass Baidu PP-DocLayout_plus-L neural parse (warms cache for BOTH text/abstract AND ALL figures/tables!)
    if(getPaddleParserUrl()) {
      phase('使用百度版面模型精准解析摘要、正文、全部插图与表格');
      await parsePdfWithBaiduService(sourcePdf,paperDir,urlPrefix);
    } else {
      phase('读取PDF正文与文献信息');
    }
    const evidence=await extractUploadedPdf(sourcePdf);
    phase('核对期刊与发表信息，识别研究方向和数据集来源');
    let paper=await buildUploadedPaper(evidence,id,{userId:job.user.id,username:job.user.username,displayName:job.user.displayName,fileName:job.fileName,uploadedAt:job.createdAt,sha256:job.sha256});
    let existing=duplicate(paper);
    if(!existing) {
      if(isPaperSuppressed(paper.title,paper.doi))throw new Error('该文献已由管理员删除；请联系管理员确认后恢复收录。');
      if(listPapers().length>=(getAutoSyncConfig().maxStoredPapers||1000))throw new Error('公共文献池容量已满，请联系管理员。');
      phase('整理全量原文插图与表格');
      const media=await extractOriginalPaperMedia(paper);
      paper.anatomy.paperFigures=media.paperFigures;paper.anatomy.paperTables=media.paperTables;
      if(!media.paperFigures.length)paper.parsing!.warnings.push('未可靠识别原文方法图，可从站内PDF查看；管理员可补充图像。');
      if(!media.paperTables.length)paper.parsing!.warnings.push('未可靠识别实验表格，未生成或推测实验数值。');
      phase('生成中文解读、图注和关键词');
      paper=await localizePaper(paper);
      // Recheck after asynchronous work: a concurrent import or deletion may have changed the pool.
      existing=duplicate(paper);
      if(!existing) {
        if(isPaperSuppressed(paper.title,paper.doi))throw new Error('该文献已由管理员移除，已停止入库。');
        if(listPapers().length>=(getAutoSyncConfig().maxStoredPapers||1000))throw new Error('公共文献池容量已满，请联系管理员。');
        upsertPaper(paper);committed=true;
        recordSyncLog('pdf_upload',1,`成员上传PDF并自动解析：${paper.title.slice(0,80)}`);
      }
    }
    job.paperId=existing?.id||paper.id;job.alreadyExists=Boolean(existing);
    const userStillExists=listAllUsers().some(u=>u.id===job.user.id);
    if((read(job.id)?.destination||job.destination)==='lab' && userStillExists){job.destination='lab';addLabPaper(job.paperId,job.user);}
    if(job.addToMyKb && listAllUsers().some(u=>u.id===job.user.id))upsertUserKbItem(job.user.id,job.paperId,{});
    job.status='completed';job.phase=existing?'文献已存在，已定位公共池条目':'已完成解析并加入公共文献池';save(job);
  }catch(error) {job.status='failed';job.error=error instanceof Error?error.message:'PDF解析失败';job.phase='解析未完成';save(job);}
  finally {
    if(fs.existsSync(incoming(job.id)))fs.unlinkSync(incoming(job.id));
    if(paperDir && !committed && !getPaperById(path.basename(paperDir))) {
      const absolute=path.resolve(paperDir);
      if(absolute.startsWith(path.resolve(PAPER_ASSETS_DIR)+path.sep))fs.rmSync(absolute,{recursive:true,force:true});
    }
  }
}
async function drain():Promise<void> {
  if(running)return;running=true;
  try {
    while(true) {
      const row=jobs.prepare("SELECT id FROM imports WHERE status='queued' ORDER BY created_at LIMIT 1").get() as {id:string}|undefined;
      if(!row)break;
      const job=read(row.id)!;
      await processJob(job);
    }
  }catch(error){console.error('[PDF上传队列]',error);}
  finally {running=false;}
}
export function startPdfImportQueue():void {
  for(const name of fs.readdirSync(root)) {
    if(!/^[a-f0-9-]{36}\.pdf$/.test(name))continue;
    const job=read(name.slice(0,-4));
    const file=path.resolve(root,name);
    if((!job || job.status==='completed' || job.status==='failed') && file.startsWith(root+path.sep))fs.unlinkSync(file);
  }
  for(const row of jobs.prepare("SELECT id FROM imports WHERE status='processing'").all() as Array<{id:string}>) {
    const job=read(row.id)!;job.status='queued';job.phase='服务重启，等待继续解析';save(job);
  }
  void drain();
  setInterval(()=>{void drain();},15000).unref();
}
