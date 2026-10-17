import React from 'react';
import {css} from './style.js';
const h=React.createElement;
export function SuggestButton(p){
 const state=React.useSyncExternalStore(p.assistSuggest.subscribe,p.assistSuggest.getSnapshot,p.assistSuggest.getSnapshot);
 const session=p.useSession(s=>s);if(session?.subagent||session?.removed)return null;
 return h('span',{className:'lpa'},h('style',null,css),h('button',{type:'button',className:'lpa-button',disabled:!state.ready,'aria-busy':state.pending,title:p.t(state.reason),onClick:()=>{void p.assistSuggest.run();}},h('span',{'aria-hidden':true},'💡 '),p.t(state.pending?'generatingSuggest':'suggest')));
}
