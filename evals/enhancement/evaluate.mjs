import {createHash} from 'node:crypto';

export const LABELS=Object.freeze(['effective','cosmetic','drift','uncertain']);
const INTENTS=['preserved','changed','uncertain'];
const BENEFITS=['specific','cosmetic','none','uncertain'];
const STATUS=['user-confirmed','proposed'];
const fail=message=>{throw new Error(message);};
const text=value=>typeof value==='string'&&value.trim().length>0;
function object(value,keys,where){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(`${where}: expected object`);
 if(Object.keys(value).some(key=>!keys.includes(key)))fail(`${where}: unknown field`);
}
const oneOf=(value,values,where)=>{if(!values.includes(value))fail(`${where}: invalid value`);};
const requireText=(value,where)=>{if(!text(value))fail(`${where}: nonempty text required`);};

/** Consistency of declared assessments only. This does NOT infer intent or semantic quality. */
export function declaredLabel(intent,benefit){
 oneOf(intent,INTENTS,'intent');oneOf(benefit,BENEFITS,'benefit');
 if(intent==='changed')return 'drift';
 if(intent==='uncertain'||benefit==='uncertain')return 'uncertain';
 return benefit==='specific'?'effective':'cosmetic';
}

function validateAssessment(value,item,where,withId=false){
 object(value,['label','intent','benefit','problem','change','rationale','evidence',...(withId?['id']:[])],where);
 oneOf(value.label,LABELS,`${where}.label`);
 if(declaredLabel(value.intent,value.benefit)!==value.label)fail(`${where}: label contradicts declared intent/benefit`);
 for(const key of ['problem','change','rationale'])requireText(value[key],`${where}.${key}`);
 if(!Array.isArray(value.evidence)||value.evidence.length<2)fail(`${where}: at least two evidence references required`);
 let candidate=false,input=false;
 for(const [index,e] of value.evidence.entries()){
  const at=`${where}.evidence[${index}]`;object(e,['source','qaIndex','quote'],at);requireText(e.quote,`${at}.quote`);
  let source;
  if(e.source==='draft'||e.source==='candidate'){
   if(Object.hasOwn(e,'qaIndex'))fail(`${at}: qaIndex only belongs to QA evidence`);
   source=item[e.source];candidate ||= e.source==='candidate';input ||= e.source==='draft';
  }else if(e.source==='qa-question'||e.source==='qa-answer'){
   if(!Number.isInteger(e.qaIndex)||e.qaIndex<0||e.qaIndex>=item.qa.length)fail(`${at}: invalid QA index`);
   source=item.qa[e.qaIndex][e.source==='qa-question'?'question':'answer'];input ||= e.source==='qa-question';
  }else fail(`${at}: invalid evidence source`);
  if(!source.includes(e.quote))fail(`${at}: quote is absent from its declared source`);
 }
 if(!candidate||!input)fail(`${where}: cite candidate and draft or user QA`);
 // Literal quote existence is traceability, not proof of interpretation or user authorization.
}

export function validateDataset(data){
 object(data,['version','rubricVersion','cases'],'dataset');
 if(data.version!==1||data.rubricVersion!=='1')fail('unsupported dataset/rubric version');
 if(!Array.isArray(data.cases)||!data.cases.length)fail('dataset: cases required');
 const ids=new Set();
 for(const item of data.cases){
  object(item,['id','group','source','referenceStatus','draft','qa','candidate','reference'],'case');
  if(typeof item.id!=='string'||!/^E\d{3}$/.test(item.id)||ids.has(item.id))fail('case: invalid or duplicate id');
  ids.add(item.id);const at=item.id;
  for(const key of ['group','draft','candidate'])requireText(item[key],`${at}.${key}`);
  oneOf(item.source,['user-example','synthetic'],`${at}.source`);oneOf(item.referenceStatus,STATUS,`${at}.referenceStatus`);
  if(!Array.isArray(item.qa))fail(`${at}: QA array required`);
  for(const qa of item.qa){object(qa,['question','answer'],`${at}.qa`);requireText(qa.question,`${at}.question`);if(typeof qa.answer!=='string')fail(`${at}: answer must be text`);}
  validateAssessment(item.reference,item,`${at}.reference`);
 }
 return data;
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export function datasetHash(data){return createHash('sha256').update(JSON.stringify(canonical(validateDataset(data)))).digest('hex');}

export function blindExport(data){
 const hash=datasetHash(data);
 const order=id=>createHash('sha256').update(hash+id).digest('hex');
 const cases=data.cases.map(({id,draft,qa,candidate})=>({id,draft,qa:qa.map(x=>({...x})),candidate})).sort((a,b)=>order(a.id).localeCompare(order(b.id)));
 return {rubricVersion:data.rubricVersion,datasetHash:hash,cases};
}
export function judgmentTemplate(data){
 const pack=blindExport(data);
 return {datasetHash:pack.datasetHash,evaluator:{kind:'human',name:''},judgments:pack.cases.map(({id})=>({id,label:null,intent:null,benefit:null,problem:'',change:'',rationale:'',evidence:[]}))};
}

export function validateJudgments(data,result){
 validateDataset(data);object(result,['datasetHash','evaluator','judgments'],'results');
 if(result.datasetHash!==datasetHash(data))fail('results: dataset hash mismatch; do not score stale or different cases');
 object(result.evaluator,['kind','name'],'evaluator');oneOf(result.evaluator.kind,['human','model'],'evaluator.kind');requireText(result.evaluator.name,'evaluator.name');
 if(!Array.isArray(result.judgments))fail('results: judgments array required');
 const cases=new Map(data.cases.map(c=>[c.id,c])),seen=new Set();
 for(const row of result.judgments){
  if(!row||typeof row.id!=='string'||!cases.has(row.id)||seen.has(row.id))fail('results: unknown or duplicate id');
  seen.add(row.id);validateAssessment(row,cases.get(row.id),row.id,true);
 }
 if(seen.size!==cases.size)fail(`results: incomplete coverage (${seen.size}/${cases.size}); missing cases cannot be silently excluded`);
 return result;
}
const ratio=(count,total)=>total?count/total:null;
function agreement(items,predictions){
 const matched=items.filter(c=>predictions.get(c.id).label===c.reference.label).length;
 return {matched,total:items.length,rate:ratio(matched,items.length)};
}

/** Compare supplied judgments with curated references. No model call and no semantic verifier. */
export function score(data,result){
 validateJudgments(data,result);
 const predictions=new Map(result.judgments.map(j=>[j.id,j]));
 const confusion=Object.fromEntries(LABELS.map(label=>[label,Object.fromEntries(LABELS.map(other=>[other,0]))]));
 const disagreements=[];
 for(const item of data.cases){
  const expected=item.reference.label,actual=predictions.get(item.id).label;confusion[expected][actual]++;
  if(expected!==actual)disagreements.push({id:item.id,reference:expected,judgment:actual,referenceStatus:item.referenceStatus});
 }
 const nonEffective=data.cases.filter(c=>c.reference.label!=='effective');
 const effective=data.cases.filter(c=>c.reference.label==='effective');
 const falseEffective=nonEffective.filter(c=>predictions.get(c.id).label==='effective').map(c=>c.id);
 const missedEffective=effective.filter(c=>predictions.get(c.id).label!=='effective').map(c=>c.id);
 return {
  kind:'offline-reference-comparison',datasetHash:datasetHash(data),rubricVersion:data.rubricVersion,
  declaredEvaluator:{...result.evaluator},semanticVerification:false,humanReviewRequired:true,
  notice:'仅比较提交标签与维护的参考标签；出处可定位、声明自洽不代表理由真实成立。此开发对照集不是独立隐藏测试集。工具不调用模型、不核实评审者身份。',
  coverage:{expected:data.cases.length,submitted:result.judgments.length},
  referenceAgreement:agreement(data.cases,predictions),confusion,
  byReferenceStatus:Object.fromEntries(STATUS.map(status=>[status,agreement(data.cases.filter(c=>c.referenceStatus===status),predictions)])),
  byReferenceLabel:Object.fromEntries(LABELS.map(label=>[label,agreement(data.cases.filter(c=>c.reference.label===label),predictions)])),
  falseEffective:{count:falseEffective.length,nonEffectiveTotal:nonEffective.length,rate:ratio(falseEffective.length,nonEffective.length),ids:falseEffective},
  missedEffective:{count:missedEffective.length,effectiveTotal:effective.length,rate:ratio(missedEffective.length,effective.length),ids:missedEffective},
  disagreements,
 };
}
