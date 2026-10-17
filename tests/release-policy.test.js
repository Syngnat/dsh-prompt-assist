import test from 'node:test';
import assert from 'node:assert/strict';
import {releasePlan,verifyPublication,requireVersionAdvance,assertRepositoryRemote} from '../scripts/release-policy.mjs';
const sha='a'.repeat(40), input={branch:'release/1.2.8',version:'1.2.8',clean:true,candidateSha:sha};
test('release plan uses unversioned public spec',()=>assert.equal(releasePlan(input).installSpec,'github:Syngnat/dsh-prompt-assist'));
for(const [field,value] of [['branch','main'],['branch',''],['branch','HEAD'],['version','1.2.8-rc.1'],['version','1.2.8+local'],['clean',false],['candidateSha','bad'],['publishedSha','b'.repeat(40)],['ci',[]]])test('release gate rejects '+field+'='+JSON.stringify(value),()=>assert.throws(()=>releasePlan({...input,[field]:value})));
test('only exact candidate successful CI passes',()=>assert.doesNotThrow(()=>releasePlan({...input,publishedSha:sha,ci:[{name:'Build and test',event:'push',status:'completed',conclusion:'success',headSha:sha}]})));
test('main tag and latest release must agree',()=>{const plan=releasePlan(input), receipt={mainSha:sha,tagSha:sha,latestTag:'v1.2.8',draft:false,prerelease:false,defaultBranch:'main'};assert.doesNotThrow(()=>verifyPublication(plan,receipt));for(const key of ['mainSha','tagSha','latestTag','defaultBranch'])assert.throws(()=>verifyPublication(plan,{...receipt,[key]:'wrong'}));assert.throws(()=>verifyPublication(plan,{...receipt,draft:true}));});
test('stable release cannot go backward or overwrite latest',()=>{assert.doesNotThrow(()=>requireVersionAdvance('1.2.8','v1.2.7'));assert.throws(()=>requireVersionAdvance('1.2.7','v1.2.7'));assert.throws(()=>requireVersionAdvance('1.2.6','v1.2.7'));});
test('publication refuses another repository',()=>{assert.doesNotThrow(()=>assertRepositoryRemote('https://github.com/Syngnat/dsh-prompt-assist.git'));assert.throws(()=>assertRepositoryRemote('https://github.com/other/repo.git'));});

test('PR merge validation alone is not candidate push validation',()=>assert.throws(()=>releasePlan({...input,ci:[{name:'Build and test',event:'pull_request',status:'completed',conclusion:'success',headSha:sha}]})));
