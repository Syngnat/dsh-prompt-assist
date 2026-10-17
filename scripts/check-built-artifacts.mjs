import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const files=[pkg.exports['.'].slice(2),'client.js','client-runtime.js'];
execFileSync('git',['ls-files','--error-unmatch','--',...files],{stdio:'inherit'});
execFileSync('git',['diff','--exit-code','--',...files],{stdio:'inherit'});
