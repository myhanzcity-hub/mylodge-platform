import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const env={...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 이상으로 실행해 주세요.');
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',env});if(r.status!==0)process.exit(r.status||1);}
if(!existsSync('node_modules/vinext')){
 const npmPaths=process.platform==='win32'?execFileSync('where.exe',['npm.cmd'],{encoding:'utf8'}).trim().split(/\r?\n/):[];
 const npmCli=process.env.npm_execpath||npmPaths.map(p=>path.join(path.dirname(p),'node_modules/npm/bin/npm-cli.js')).find(existsSync);
 if(!npmCli)throw new Error('npm 설치 경로를 찾지 못했습니다. Node.js 설치를 확인해 주세요.');
 run([npmCli,'ci','--no-audit','--no-fund']);
}
try{const r=await fetch('http://127.0.0.1:5173');if(r.ok&&(await r.text()).includes('마이롯지')){console.log('마이롯지가 실행 중입니다: http://127.0.0.1:5173');process.exit(0);}}catch{}
if(!existsSync('dist/server/wrangler.json'))run(['scripts/run-framework.mjs','build']);
mkdirSync('.sites-runtime',{recursive:true});
const marker='.sites-runtime/local-db-initialized.json';
if(!existsSync(marker)){
 const args=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'];
 const query=spawnSync(process.execPath,[...args,'--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='preview_workspaces'",'--json'],{env,encoding:'utf8'});
 if(query.status!==0)throw new Error('로컬 데이터베이스를 확인하지 못했습니다.');
 if(!query.stdout.includes('preview_workspaces'))run([...args,'--file','drizzle/0000_neat_molly_hayes.sql']);
 writeFileSync(marker,JSON.stringify({migration:'0000_neat_molly_hayes.sql',checkedAt:new Date().toISOString()}));
}
console.log('\n마이롯지 로컬 미리보기: http://127.0.0.1:5173\n종료하려면 Ctrl+C를 누르세요.\n');
const child=spawn(process.execPath,['scripts/run-framework.mjs','dev','--port','5173','--hostname','127.0.0.1'],{stdio:'inherit',env});
process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>process.exit(code||0));
