import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENHANCE_ROLE_PROMPT as role} from '../assist/enhance-role.js';
import {buildAssistPrompt} from '../assist/prompts.js';
const cases=JSON.parse(readFileSync(new URL('./fixtures/enhance-perspective.json',import.meta.url),'utf8'));
// Contract/request tests, not a claim that a model produced any acceptable example.
test('ambiguity fallback no longer authorizes invented clarification',()=>{
 assert.doesNotMatch(role,/必要时加入一句简短的/);
 for(const rule of ['不得擅自添加澄清步骤','原样返回原文','不得擅自选择'])assert.ok(role.includes(rule),rule);
});
test('speaker and communicative intent are explicit constraints',()=>{
 for(const rule of ['用户向接收消息的助手提出需求','不能把增强器的疑问改写成用户自问','反馈仍是反馈','用户原本明确提出的询问或澄清要求应保留'])assert.ok(role.includes(rule),rule);
});
test('context resolves meaning only with user evidence and preserves negation',()=>{
 for(const rule of ['先检查同一任务的相关上下文','助手未获确认的建议','否定范围','较新的明确纠正'])assert.ok(role.includes(rule),rule);
});
test('corpus covers required categories and captures the reported failure without inferring intent',()=>{
 for(const category of ['上下文可消歧','无法消歧','否定句','用户纠正'])assert.ok(cases.some(c=>c.category===category));
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 const report=cases.find(c=>c.id==='reported-self-question');
 assert.equal(report.draft,'上次检查时间没有要格式化');assert.deepEqual(report.acceptableExamples,[report.draft]);
 assert.match(report.contextNote,/未捕获/);assert.match(report.rejectedExamples[0].text,/请先确认：我说的/);
 assert.ok(cases.some(c=>c.id==='explicit-clarification-request'));
});
for(const c of cases)test('request preserves source and excludes evaluation answers: '+c.id,()=>{
 const prompt=buildAssistPrompt('enhance',c.draft,c.qa);
 assert.equal(prompt.system,role);
 assert.deepEqual(JSON.parse(prompt.user),{feature:'enhance',draft:c.draft,qa:c.qa,files:[],references:[]});
 assert.ok(c.criteria.length>=2&&c.acceptableExamples.length&&c.rejectedExamples.length);
 for(const bad of c.rejectedExamples)assert.ok(bad.text&&bad.reason);
 assert.ok(!prompt.system.includes(c.rejectedExamples[0].text),'Rejected outputs are evaluation data, not system examples');
});
