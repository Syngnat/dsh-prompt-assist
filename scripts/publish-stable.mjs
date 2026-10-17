// Explicit maintainer operation only. This script is never included in the plugin tarball.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {releasePlan,verifyPublication,requireVersionAdvance,assertRepositoryRemote,REPOSITORY} from './release-policy.mjs';
const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), publish=args.includes('--publish');
const notesIndex=args.indexOf('--notes'), notes=notesIndex<0?null:resolve(args[notesIndex+1]??'');
function capture(command,argv){return execFileSync(command,argv,{cwd,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','inherit']}).trim();}
function run(command,argv){execFileSync(command,argv,{cwd,timeout:180000,stdio:'inherit'});}
const git=(...argv)=>capture('git',argv);
const gh=(...argv)=>JSON.parse(capture('gh',argv));
const pkg=JSON.parse(readFileSync(resolve(cwd,'package.json'),'utf8'));
const branch=git('branch','--show-current'), sha=git('rev-parse','HEAD');
assertRepositoryRemote(git('remote','get-url','origin'));
let plan=releasePlan({branch,version:pkg.version,clean:git('status','--porcelain')==='',candidateSha:sha});
console.log(JSON.stringify({...plan,mode:publish?'publish':'read-only-plan'},null,2));
if(!publish){console.log('No files, refs, releases or installed plugins were changed. Add --publish --notes <file> to execute.');process.exit(0);}
assert.ok(notes,'--notes <existing release notes file> is required');readFileSync(notes,'utf8');
const publishedSha=git('ls-remote','--exit-code','origin',`refs/heads/${branch}`).split(/\s/)[0];
const ci=gh('run','list','--repo',REPOSITORY,'--commit',sha,'--limit','50','--json','name,status,conclusion,headSha,event');
plan=releasePlan({branch,version:pkg.version,clean:true,candidateSha:sha,publishedSha,ci});
assert.equal(gh('repo','view',REPOSITORY,'--json','defaultBranchRef').defaultBranchRef.name,'main','The stable distribution must use default branch main');
const latest=gh('api',`repos/${REPOSITORY}/releases/latest`);
requireVersionAdvance(pkg.version,latest.tag_name);
assert.equal(git('tag','--list',plan.tag),'','Never rewrite a local release tag');
assert.equal(git('ls-remote','origin',`refs/tags/${plan.tag}`),'','Never rewrite a remote release tag');
git('fetch','origin','main');
run('git',['merge-base','--is-ancestor','origin/main','HEAD']);
run(process.execPath,['build.mjs']);
run(process.execPath,['--test','tests/*.test.js']);
run('git',['diff','--exit-code']);
assert.equal(git('status','--porcelain'),'','Build/tests must leave the candidate clean');
const out=resolve(cwd,'.release-check','publish',plan.version);mkdirSync(out,{recursive:true});
const npmExec=process.env.npm_execpath;
if(npmExec)run(process.execPath,[npmExec,'pack','--pack-destination',out]);
else run(process.platform==='win32'?'pnpm.cmd':'pnpm',['pack','--pack-destination',out]);
const archive=resolve(out,`${pkg.name.replace(/^@/,'').replace('/','-')}-${pkg.version}.tgz`);
const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
const sums=resolve(out,'SHA256SUMS.txt');writeFileSync(sums,`${sum}  ${archive.split(/[\\/]/).at(-1)}\n`);
// Draft and assets are prepared before main is promoted. No force-push or tag rewriting.
run('git',['tag','-a',plan.tag,'-m',`Stable release ${plan.version}`]);
run('git',['push','origin',`refs/tags/${plan.tag}`]);
run('gh',['release','create',plan.tag,archive,sums,'--repo',REPOSITORY,'--verify-tag','--draft','--title',`${plan.tag} — Stable update notices`,'--notes-file',notes]);
try{
  run('git',['push','origin','HEAD:refs/heads/main']);
  run('gh',['release','edit',plan.tag,'--repo',REPOSITORY,'--draft=false','--latest']);
  const refs=git('ls-remote','origin','refs/heads/main',`refs/tags/${plan.tag}^{}`).split('\n').map(line=>line.split(/\s+/));
  const release=gh('api',`repos/${REPOSITORY}/releases/latest`);
  const repo=gh('repo','view',REPOSITORY,'--json','defaultBranchRef');
  verifyPublication(plan,{mainSha:refs.find(x=>x[1]==='refs/heads/main')?.[0],tagSha:refs.find(x=>x[1]===`refs/tags/${plan.tag}^{}`)?.[0],latestTag:release.tag_name,draft:release.draft,prerelease:release.prerelease,defaultBranch:repo.defaultBranchRef.name});
  console.log('Published and verified:',release.html_url,'SHA256:',sum);
}catch(error){
  console.error('Publication did not fully settle. Do not rewrite tags or force-push. Inspect the draft/public release and main; finish publishing this verified candidate before starting another release.');throw error;
}
console.log('This maintainer script does not install or upgrade any DSH profile.');
