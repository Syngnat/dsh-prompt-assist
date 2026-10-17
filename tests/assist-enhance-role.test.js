import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ENHANCE_ROLE_PROMPT } from '../assist/enhance-role.js';
import { buildAssistPrompt } from '../assist/prompts.js';
test('enhancement installs the complete role as system instructions, not draft text',()=>{
 const input='照前面说的整理一下';const prompt=buildAssistPrompt('enhance',input,[{question:'只优化表达，不扩大范围',answer:'收到'}]);
 assert.equal(prompt.system,ENHANCE_ROLE_PROMPT);assert.equal(JSON.parse(prompt.user).draft,input);
 for(const section of ['【输入与边界】','【理解真实需求】','【重组表达】','【处理不确定性】','【输出前检查】','【输出格式】'])assert.ok(prompt.system.includes(section));
});
test('role explicitly keeps current intent, accepted decisions and corrections separate',()=>{
 for(const text of ['以当前原文为改写主体','用户较新的明确纠正优先','助手提出但用户未确认的建议','不视为接受全部历史建议','讨论或评估不变成执行命令','可选项不变成必选项'])assert.ok(ENHANCE_ROLE_PROMPT.includes(text));
});
test('missing referents, ambiguity and literal references have explicit constraints',()=>{
 for(const text of ['唯一对象或方案','不得擅自选择','不要为了完整而编造','不得新增功能','保持原样的代码','不要把引用名扩写成臆测路径'])assert.ok(ENHANCE_ROLE_PROMPT.includes(text));
});
test('multi-turn scattered requirements remain ordered source data, assistant suggestions are not promoted by assembly',()=>{
 const qa=[{question:'按钮放输入框旁边',answer:'还可以自动发送'}, {question:'不要自动发送，配置仍在面板里',answer:'好'}];
 const value=buildAssistPrompt('enhance','就这样，优化下表达',qa);assert.deepEqual(JSON.parse(value.user).qa,qa);assert.equal(value.system,ENHANCE_ROLE_PROMPT);assert.ok(!value.system.includes('还可以自动发送'));
});
test('suggest system prompt is byte-for-byte unchanged from 1.1.8',()=>{
 assert.equal(createHash('sha256').update(buildAssistPrompt('suggest','').system).digest('hex'),'db4cf0a361c6143e465fb58b1089ec91a2d3904df6069820fbf29e19d6f7d89e');
});
