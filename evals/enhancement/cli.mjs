#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateDataset,datasetHash,blindExport,judgmentTemplate,score,LABELS} from './evaluate.mjs';

const help=`Offline enhancement evaluation — no network or model calls.
Usage:
  node evals/enhancement/cli.mjs validate [--dataset path]
  node evals/enhancement/cli.mjs export [--dataset path]
  node evals/enhancement/cli.mjs template [--dataset path]
  node evals/enhancement/cli.mjs score judgments.json [--dataset path]
All results go to stdout. Export omits reference labels/evidence; template is intentionally incomplete.
Score compares supplied labels only, not semantic correctness. Full coverage and matching dataset hash are required.
`;
async function readJson(path){
 const text=await readFile(path,'utf8');
 try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('Input is not valid JSON');}
}
async function main(args){
 if(args.length===1&&['--help','-h'].includes(args[0])){process.stdout.write(help);return;}
 const action=args.shift();if(!['validate','export','template','score'].includes(action))throw new Error('Choose validate, export, template or score; use --help');
 let dataset=fileURLToPath(new URL('./cases.json',import.meta.url)),specified=false;const positional=[];
 for(let i=0;i<args.length;i++){
  if(args[i]==='--dataset'){
   if(specified||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Provide --dataset once with a file path');
   specified=true;dataset=args[++i];
  }else if(args[i].startsWith('--'))throw new Error('Unknown option');else positional.push(args[i]);
 }
 if(positional.length!==(action==='score'?1:0))throw new Error('Only score accepts one judgments file');
 const data=validateDataset(await readJson(dataset));let output;
 if(action==='validate')output={kind:'dataset-structure-check',cases:data.cases.length,datasetHash:datasetHash(data),
  labels:Object.fromEntries(LABELS.map(label=>[label,data.cases.filter(c=>c.reference.label===label).length])),
  referenceStatus:Object.fromEntries(['user-confirmed','proposed'].map(status=>[status,data.cases.filter(c=>c.referenceStatus===status).length])),
  semanticVerification:false,modelCalls:0};
 if(action==='export')output=blindExport(data);
 if(action==='template')output=judgmentTemplate(data);
 if(action==='score')output=score(data,await readJson(positional[0]));
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
}
main(process.argv.slice(2)).catch(error=>{process.stderr.write(`Evaluation failed: ${error.message}\n`);process.exitCode=1;});
