/** Explicit profile switches for runtime unit fixtures; persistence has separate real-SDK tests. */
export function fixtureEnablement(enabled={suggest:true,enhance:true}) {
 let snapshot={scope:'profile',revision:0,enabled:{...enabled}};const listeners=new Set();
 return {getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async set(feature,value,{signal,expectedRevision}={}){signal?.throwIfAborted();if(expectedRevision!==undefined&&expectedRevision!==snapshot.revision)throw Object.assign(Error('stale-enablement'),{code:'stale-enablement'});snapshot={scope:'profile',revision:snapshot.revision+1,enabled:{...snapshot.enabled,[feature]:value}};for(const listener of listeners)listener(snapshot);return snapshot;},async close(){listeners.clear();}};
}
