import test from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../host-source.js';
test('Host entry checks capabilities before resolving adapters or mounting',async()=>{await assert.rejects(()=>apply({get(){throw Error('must not resolve before preflight');}}),e=>e.code==='unsupported-host-capability'&&e.message.includes('llm.resolveModelInfo'));});
