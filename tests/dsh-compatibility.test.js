import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import semver from 'semver';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
for(const version of ['0.2.1-rc.1','0.2.1-rc.2','0.2.1-rc.99','0.2.1','0.2.2-rc.1','0.2.9','0.3.0-alpha.1','0.3.0-rc.1','0.3.0','1.0.0'])test('DSH version admission accepts (capability checks still required) '+version,()=>assert.equal(semver.satisfies(version,pkg.engines.dsh,{includePrerelease:true}),true));
for(const version of ['0.2.0','0.2.1-rc.0'])test('DSH below minimum rejects '+version,()=>assert.equal(semver.satisfies(version,pkg.engines.dsh,{includePrerelease:true}),false));
