import React from 'react';
import { css } from './style.js';
const h=React.createElement;
export function EnhanceButton(p) {
 const state=React.useSyncExternalStore(p.assistEnhance.subscribe,p.assistEnhance.getSnapshot,p.assistEnhance.getSnapshot);
 const session=p.useSession(s=>s);
 if(session?.subagent||session?.removed)return null;
 return h('span',{className:'lpa'},h('style',null,css),h('button',{
  type:'button',className:'lpa-button',disabled:!state.ready,'aria-busy':state.pending,
  title:p.t(state.reason),onClick:()=>{void p.assistEnhance.run();},
 },h('span',{'aria-hidden':true},'✨ '),p.t(state.pending?'enhancing':'enhance')));
}
