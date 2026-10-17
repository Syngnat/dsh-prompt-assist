import {canSuggest} from './editor.js';
export function enhanceAvailability(r) {
  let reason = !r.allowed ? 'access' : !r.state ? 'load' : !r.settings.enhance.enabled ? 'enableEnhance' : r.dirty ? 'settingsChanged' : !r.input.draft.trim() ? 'empty' : r.input.phase !== 'plain' ? 'busy' : r.result.pending ? 'generating' : 'generate';
  return { ready: reason === 'generate', pending: r.result.pending === 'enhance', reason };
}
/** One action per retained session; the toolbar never mounts a second runtime. */
export function createEnhanceAction() {
  let handler=null, running=false, base={ready:false,pending:false,reason:'load'};
  let snapshot=base;const listeners=new Set();
  const publish=()=>{const next={...base,ready:base.ready&&!running,pending:base.pending||running};if(JSON.stringify(next)===JSON.stringify(snapshot))return;snapshot=next;listeners.forEach(fn=>fn());};
  return {
    getSnapshot:()=>snapshot,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    update(value,run){base=value;handler=run;publish();},
    clear(){handler=null;base={ready:false,pending:false,reason:'load'};publish();},
    async run(){if(!snapshot.ready||!handler)return false;const invoke=handler;running=true;publish();try{return await invoke();}finally{running=false;publish();}},
  };
}

export function suggestAvailability(r){
 const reason=!r.allowed?'access':!r.state?'load':!r.settings.suggest.enabled?'enableSuggest':r.busy?'busy':r.dirty?'settingsChanged':!canSuggest(r.input)?'draftOccupied':!r.state.qaCount?'contextError':r.result.pending?'generating':'generateSuggest';
 return {ready:reason==='generateSuggest',pending:r.result.pending==='suggest',reason};
}
