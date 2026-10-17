/** Settings follow the last composer actually visited, never another session implicitly. */
export function createSettingsTarget() {
 let state={sessionId:null};const listeners=new Set();
 return {getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},select(sessionId){if(state.sessionId===sessionId)return;state={sessionId};listeners.forEach(fn=>fn());}};
}
