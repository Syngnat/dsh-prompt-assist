import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateDataset,validateJudgments,declaredLabel,datasetHash,blindExport,judgmentTemplate,score,LABELS} from '../evals/enhancement/evaluate.mjs';
const data=JSON.parse(readFileSync(new URL('../evals/enhancement/cases.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);
const syntheticSubmission=(dataset=data)=>({datasetHash:datasetHash(dataset),evaluator:{kind:'model',name:'synthetic-plumbing-fixture-not-a-model-run'},judgments:dataset.cases.map(c=>({id:c.id,...clone(c.reference)}))});

test('reference set is traceable, spans four classes, and keeps proposed labels separate',()=>{
 assert.strictEqual(validateDataset(data),data);assert.ok(data.cases.length>=20);
 for(const label of LABELS)assert.ok(data.cases.filter(c=>c.reference.label===label).length>=3,label);
 assert.equal(data.cases.filter(c=>c.referenceStatus==='user-confirmed').length,2);
 assert.ok(data.cases.some(c=>c.referenceStatus==='proposed'));
});
test('user-confirmed structural improvement does not require extra content',()=>{
 const item=data.cases.find(c=>c.draft==='QA轮数改成全局模型设置也改成全局别每个会话重新设置。');
 assert.ok(item);assert.equal(item.reference.label,'effective');assert.equal(item.reference.benefit,'specific');assert.equal(item.referenceStatus,'user-confirmed');
});
test('same semicolon edit is uncertain, effective or drift depending on confirmed context',()=>{
 const variants=data.cases.filter(c=>c.draft==='仅允许管理员删除普通用户不能删除。'&&c.candidate==='仅允许管理员删除；普通用户不能删除。');
 assert.equal(variants.length,3);assert.equal(new Set(variants.map(c=>c.group)).size,1);
 const noQA=variants.find(c=>c.qa.length===0);assert.equal(noQA.reference.label,'uncertain');assert.equal(noQA.referenceStatus,'user-confirmed');
 assert.deepEqual(new Set(variants.filter(c=>c.qa.length).map(c=>c.reference.label)),new Set(['effective','drift']));
 const supported=variants.find(c=>c.reference.label==='effective'),contradicted=variants.find(c=>c.reference.label==='drift');
 assert.match(supported.qa[0].question,/普通用户是执行者/);assert.match(contradicted.qa[0].question,/删除对象是普通用户/);
 for(const c of [supported,contradicted])assert.ok(c.reference.evidence.some(e=>e.source==='qa-question'));
});
test('authorization contrasts retain actual user/assistant roles',()=>{
 const rejected=data.cases.find(c=>c.id==='E016'),integrated=data.cases.find(c=>c.id==='E017');
 for(const c of [rejected,integrated]){assert.match(c.qa[0].question,/我还没同意执行/);assert.match(c.qa[0].answer,/立即删除/);}
 assert.equal(rejected.reference.label,'drift');assert.equal(integrated.reference.label,'effective');
 assert.match(rejected.reference.rationale,/用户消息（question）明确尚未授权执行/);
 assert.ok(integrated.reference.evidence.some(e=>e.source==='qa-question'&&e.quote.includes('影响范围')));
});
test('intent check precedes claimed benefit; no change-size heuristic is involved',()=>{
 assert.equal(declaredLabel('changed','specific'),'drift');assert.equal(declaredLabel('uncertain','specific'),'uncertain');
 assert.equal(declaredLabel('preserved','specific'),'effective');assert.equal(declaredLabel('preserved','cosmetic'),'cosmetic');
 assert.equal(declaredLabel('preserved','none'),'cosmetic');assert.equal(declaredLabel('preserved','uncertain'),'uncertain');
 assert.throws(()=>declaredLabel('probably','specific'));
});
test('invalid references, invented evidence and inconsistent labels are rejected',()=>{
 const bad=clone(data);bad.cases[0].reference.evidence[0].quote='THIS TEXT DOES NOT EXIST';assert.throws(()=>validateDataset(bad),/quote is absent/);
 const badId=clone(data);badId.cases[1].id=badId.cases[0].id;assert.throws(()=>validateDataset(badId),/duplicate/);
 const badLabel=clone(data);badLabel.cases[0].reference={...badLabel.cases[0].reference,label:'effective',intent:'changed',benefit:'specific'};
 assert.throws(()=>validateDataset(badLabel),/contradicts/);
 const badQA=clone(data);badQA.cases[0].reference.evidence[0]={source:'qa-question',qaIndex:999,quote:'x'};assert.throws(()=>validateDataset(badQA),/QA index/);
});
test('assistant proposals alone cannot supply the required user-side evidence',()=>{
 const bad=clone(data),c=bad.cases[0];c.qa=[{question:'Do not execute.',answer:'You could publish.'}];
 c.reference.evidence=[{source:'candidate',quote:c.candidate},{source:'qa-answer',qaIndex:0,quote:'You could publish.'}];
 assert.throws(()=>validateDataset(bad),/draft or user QA/);
});
test('blind export omits reference answers, categories, groups and provenance hints',()=>{
 const pack=blindExport(data);assert.deepEqual(Object.keys(pack).sort(),['cases','datasetHash','rubricVersion']);
 assert.deepEqual(new Set(pack.cases.map(c=>c.id)),new Set(data.cases.map(c=>c.id)));
 for(const row of pack.cases)assert.deepEqual(Object.keys(row).sort(),['candidate','draft','id','qa']);
 assert.deepEqual(blindExport(data),pack);
 const withQA=pack.cases.find(c=>c.qa.length);withQA.qa[0].question='modified export';assert.notEqual(data.cases.find(c=>c.id===withQA.id).qa[0].question,'modified export');
});
test('template contains no filled judgments and cannot be scored by accident',()=>{
 const template=judgmentTemplate(data);assert.ok(template.judgments.every(j=>j.label===null&&j.evidence.length===0));
 assert.throws(()=>score(data,template));
});
test('dataset fingerprints ignore object-key order but reject changed references or contexts',()=>{
 const reordered=Object.fromEntries(Object.entries(data).reverse());assert.equal(datasetHash(reordered),datasetHash(data));
 const altered=clone(data);altered.cases[0].reference.rationale+=' New annotation.';assert.notEqual(datasetHash(altered),datasetHash(data));
 assert.throws(()=>score(altered,syntheticSubmission()),/hash mismatch/);
});
test('synthetic matching labels test score plumbing, not any model quality',()=>{
 const report=score(data,syntheticSubmission());assert.equal(report.referenceAgreement.rate,1);
 assert.equal(report.falseEffective.count,0);assert.equal(report.missedEffective.count,0);
 assert.equal(report.semanticVerification,false);assert.equal(report.humanReviewRequired,true);
 assert.equal(report.byReferenceStatus['user-confirmed'].total,2);assert.ok(report.byReferenceStatus.proposed.total>0);
});
test('cosmetic, drift and uncertain false positives and missed effective edits remain visible',()=>{
 const result=syntheticSubmission();
 for(const label of ['cosmetic','drift','uncertain']){
  const c=data.cases.find(c=>c.reference.label===label),row=result.judgments.find(j=>j.id===c.id);
  Object.assign(row,{label:'effective',intent:'preserved',benefit:'specific',rationale:'Deliberately wrong semantic claim with real quotes.'});
 }
 const c=data.cases.find(c=>c.reference.label==='effective'),row=result.judgments.find(j=>j.id===c.id);
 Object.assign(row,{label:'cosmetic',intent:'preserved',benefit:'none'});
 const report=score(data,result);assert.equal(report.falseEffective.count,3);assert.equal(report.missedEffective.count,1);
 assert.equal(report.disagreements.length,4);for(const label of ['cosmetic','drift','uncertain'])assert.equal(report.confusion[label].effective,1);
});
test('missing, duplicate, unknown or extra-claim results cannot inflate a score',()=>{
 const missing=syntheticSubmission();missing.judgments.pop();assert.throws(()=>score(data,missing),/incomplete coverage/);
 const duplicate=syntheticSubmission();duplicate.judgments[1]=duplicate.judgments[0];assert.throws(()=>score(data,duplicate),/duplicate/);
 const unknown=syntheticSubmission();unknown.judgments[0].id='E999';assert.throws(()=>score(data,unknown),/unknown/);
 const extra=syntheticSubmission();extra.qualityVerified=true;assert.throws(()=>score(data,extra),/unknown field/);
});
test('quote validity and correct labels do not certify the truth of a rationale',()=>{
 const result=syntheticSubmission();result.judgments[0].rationale='An unverified assertion; literal quotes do not prove this claim.';
 assert.strictEqual(validateJudgments(data,result),result);const report=score(data,result);
 assert.equal(report.referenceAgreement.rate,1);assert.equal(report.semanticVerification,false);assert.equal(report.humanReviewRequired,true);
});
test('empty comparison buckets yield null rather than invented percentages',()=>{
 const single={...clone(data),cases:[clone(data.cases.find(c=>c.reference.label==='effective'))]};single.cases[0].referenceStatus='proposed';
 const report=score(single,syntheticSubmission(single));assert.equal(report.falseEffective.rate,null);assert.equal(report.byReferenceStatus['user-confirmed'].rate,null);
});
test('CLI scores a complete synthetic file and refuses a stale file without publishing a score',()=>{
 const base=resolve(tmpdir()),directory=mkdtempSync(join(base,'enhancement-eval-'));
 try{
  const input=join(directory,'judgments.json'),cli=fileURLToPath(new URL('../evals/enhancement/cli.mjs',import.meta.url));
  const results=syntheticSubmission();writeFileSync(input,JSON.stringify(results));
  const run=()=>spawnSync(process.execPath,[cli,'score',input],{encoding:'utf8',timeout:10000});
  const good=run();assert.equal(good.status,0,good.stderr);const report=JSON.parse(good.stdout);
  assert.equal(report.referenceAgreement.rate,1);assert.equal(report.semanticVerification,false);
  results.datasetHash='0'.repeat(64);writeFileSync(input,JSON.stringify(results));
  const stale=run();assert.equal(stale.status,1);assert.equal(stale.stdout,'');assert.match(stale.stderr,/hash mismatch/);
 }finally{
  assert.ok(isAbsolute(directory));assert.equal(dirname(directory),base);assert.match(basename(directory),/^enhancement-eval-/);
  rmSync(directory,{recursive:true,force:true});
 }
});
test('offline CLI validates, exports blind data and rejects missing score input',()=>{
 const cli=fileURLToPath(new URL('../evals/enhancement/cli.mjs',import.meta.url));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10000});
 const check=run('validate');assert.equal(check.status,0,check.stderr);assert.equal(JSON.parse(check.stdout).modelCalls,0);
 const exported=run('export');assert.equal(exported.status,0,exported.stderr);assert.deepEqual(JSON.parse(exported.stdout),blindExport(data));
 const invalid=run('score');assert.equal(invalid.status,1);assert.match(invalid.stderr,/judgments file/);
 const unsupported=run('generate');assert.equal(unsupported.status,1);assert.match(unsupported.stderr,/Choose/);
});
