import test from 'node:test';
import assert from 'node:assert/strict';
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
test('enhancement requires multi-point structure, not synonym-only edits or appended commentary',()=>{
 const draft='发现个问题，有的模型使用增强提示词会直接复述原文，没有增强效果，同时有效果的文案需要结构化，现在全挤到后面，没有换行格式。';
 const prompt=buildAssistPrompt('enhance',draft);
 assert.equal(JSON.parse(prompt.user).draft,draft);
 for(const text of ['不能只换同义词或调整标点','两个或更多可独立表达的要点','真实换行','完整替换稿','不得先照抄原文再在末尾追加'])assert.ok(prompt.system.includes(text),text);
 assert.match(prompt.system,/短请求保持简洁/);
 assert.match(prompt.system,/不要为了完整而编造/);
});
test('formatting guidance preserves literal code and permits genuinely clear short drafts',()=>{
 for(const text of ['已有的有效段落、列表和代码换行','不把代码、命令、路径','确实没有可改善之处'])assert.ok(ENHANCE_ROLE_PROMPT.includes(text),text);
 assert.match(ENHANCE_ROLE_PROMPT,/不回答问题、不执行任务/);
});
test('empty QA does not make an otherwise clear multi-point draft uneditable',()=>{
  const draft='完整问答轮树也应该是全局的，而不是每个会话设置一便呀，那个模型设置也是弄成全局吧，别每个会话设置了，太麻烦了';
  const prompt=buildAssistPrompt('enhance',draft,[]);
  assert.deepEqual(JSON.parse(prompt.user).qa,[]);assert.equal(JSON.parse(prompt.user).draft,draft);
  for(const rule of ['没有历史 QA 不等于原文意图不明确','原文本身也是消歧依据','局部不确定不能成为整段照抄的理由'])assert.ok(prompt.system.includes(rule),rule);
});
test('pasted requirements are edited without solving business rules or inventing missing fragments',()=>{
  for(const rule of ['文档复制产生的断行、粘连或截断','不要推演业务规则','不要重新计算样例结果','保留无法确定的残缺片段'])assert.ok(ENHANCE_ROLE_PROMPT.includes(rule),rule);
});
test('colloquial short requests are polished instead of returned verbatim',()=>{
 for(const rule of ['口语化表达默认属于可改善项','短句同样要过这一关','填充词','冗余虚词','这部分我不需要感知到','不需要扩展成模板，但仍要按【润色表达】检查填充词与冗余虚词'])assert.ok(ENHANCE_ROLE_PROMPT.includes(rule),rule);
 assert.doesNotMatch(ENHANCE_ROLE_PROMPT,/可保持原样，不强行扩展成模板/);
 assert.doesNotMatch(ENHANCE_ROLE_PROMPT,/确实已经通顺准确时保留原文/);
});
test('clear single constraints are polished rather than padded or invented',()=>{
 for(const rule of ['润色是本职','润色措辞本身就是收益','润色只作用于“怎么说”','不要为了制造差异而堆砌同义词','用户已确认的目标衔接','不把补充约束变成新的任务','已清晰且不需要修改的原文则按上述无改写规则处理'])assert.ok(ENHANCE_ROLE_PROMPT.includes(rule),rule);
 assert.doesNotMatch(ENHANCE_ROLE_PROMPT,/改变措辞本身不是收益/);
 assert.doesNotMatch(ENHANCE_ROLE_PROMPT,/只有整条请求均无法确定且没有安全编辑空间时，才原样返回原文/);
});
test('suggest outcome protocol is separate from plain enhancement output',()=>{
 const suggestion=buildAssistPrompt('suggest','').system;assert.notEqual(suggestion,ENHANCE_ROLE_PROMPT);
 assert.match(suggestion,/"kind":"none"/);assert.match(ENHANCE_ROLE_PROMPT,/不输出 JSON/);
});
