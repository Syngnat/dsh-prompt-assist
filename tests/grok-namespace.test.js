import test from 'node:test';
import assert from 'node:assert/strict';
import {isGrokModel,isPriorityModel,isOpenAISelection,priorityPayload,DEFAULT_PROVIDERS} from '../policy.js';

for (const model of ['安和桥/grok-4.7','xai/grok-4.7','org/xai/GROK-4.8','proxy_1/grok-10','vendor-v2/grok-4-1-fast-reasoning']) {
  test(`${model}: namespace recognition preserves raw identity and exact provider grants`,()=>{
    assert.equal(isGrokModel(model),true);assert.equal(isPriorityModel(model),true);
    const selection={provider:'proxy-id',model};
    for(const allowed of [DEFAULT_PROVIDERS,[],['xai'],['安和桥'],['Proxy-id']])assert.equal(isOpenAISelection(selection,allowed),false);
    assert.equal(isOpenAISelection(selection,['proxy-id']),true);
    const body=Object.freeze({model,input:[]}),payload=priorityPayload(body);
    assert.equal(payload.model,model);assert.equal(payload.service_tier,'priority');assert.equal(body.service_tier,undefined);
  });
}

test('namespaces cannot disguise legacy or unrelated model families or malformed paths',()=>{
  for(const model of ['xai/grok-3','xai/grok-04.7','xai/my-grok-4.7','grok-4.7/claude-sonnet',
    '/grok-4.7','xai//grok-4.7','xai/grok-4.7/','./grok-4.7','xai/../grok-4.7',
    'https://xai/grok-4.7',' xai/grok-4.7','xai/grok-4.7?q=1','xai/grok-4.7#alias','xai\\grok-4.7',
    'xai/grok-4.7\nother','xai\u0000/grok-4.7']) {
    assert.equal(isGrokModel(model),false,model);assert.equal(isPriorityModel(model),false,model);
    assert.equal(isOpenAISelection({provider:'proxy-id',model},['proxy-id']),false,model);
  }
});
