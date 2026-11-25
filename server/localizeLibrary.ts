import { initDatabase, listPapers } from './db.js';
import { localizeStoredPaper, needsChinese } from './localizationQueue.js';

initDatabase();
const papers=listPapers();
let completed=0,failed=0;
console.log(`正在将${papers.length}篇文献的解读、图注和关键词统一为中文。`);
for(let i=0;i<papers.length;i+=3) {
  await Promise.all(papers.slice(i,i+3).map(async paper=>{
    try {
      console.log(`开始补译：${paper.id}`);
      await localizeStoredPaper(paper);completed++;
      console.log(`中文化 ${completed}/${papers.length}：${paper.id}`);
    }catch(error) {failed++;console.error('补译失败',paper.id,error);}
  }));
}
const pending=listPapers().filter(needsChinese).map(p=>p.id);
console.log(JSON.stringify({completed,failed,pending}));
if(failed||pending.length)process.exitCode=1;
