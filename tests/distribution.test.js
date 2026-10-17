import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const pkg=JSON.parse(read('package.json'));
test('distribution retains package identity and contains prebuilt exported resources',()=>{
 assert.equal(pkg.name,'@local/dsh-openai-fast');assert.equal(pkg.exports['.'],'./host-v'+pkg.version+'.js');
 for(const file of [pkg.exports['.'],pkg.exports['./client'],pkg.exports['./icon'],'cordis.patch.yml','locale/en.json','locale/zh.json'])assert.equal(existsSync(new URL(file,root)),true,file);
 assert.equal(read('client.js'),read('client-runtime.js'));for(const hook of ['preinstall','install','postinstall','prepare'])assert.equal(pkg.scripts?.[hook],undefined);
});
test('approved metadata and persistence identities remain unchanged',()=>{
 const meta=JSON.parse(read('locale/zh.json')).meta;assert.equal(meta.title,'提示词辅助与 Fast 加速');assert.equal(meta.description,'提供提示词增强、下一问建议和 OpenAI Fast 加速，支持按会话独立配置模型、推理档位及辅助 Fast。');
 assert.match(read('cordis.patch.yml'),/id: local-openai-fast/);assert.match(read('assist/identity.js'),/local.promptAssist.v2/);
});
test('public runtime and patch contain no developer-specific checkout or home paths',()=>{
 for(const file of [pkg.exports['.'],'client-runtime.js','cordis.patch.yml','build.mjs'])assert.doesNotMatch(read(file),/[A-Za-z]:[\\/](?:Users|Work)[\\/]|frontend[\\/]package\.json/,file);
});
