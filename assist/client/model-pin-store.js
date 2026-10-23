// Quick-provider pins for the composer model picker: which providers stay
// expanded at the top level while everything else shares one other-models group.
// Session-free, profile-local browser storage; no host contract is involved.
const PIN_KEY='local-prompt-assist:model-pinned-providers';

export function normalizePinIds(raw){
 if(!Array.isArray(raw))return [];
 const seen=new Set();const ids=[];
 for(const item of raw){
  if(typeof item!=='string'||item==='')continue;
  if(seen.has(item))continue;
  seen.add(item);ids.push(item);
 }
 return ids;
}

/** Intersect stored pins with the current catalog, keeping the stored order. */
export function pinIdsForSections(raw,sections){
 const known=new Set((sections??[]).map(g=>g?.id).filter(id=>typeof id==='string'));
 return normalizePinIds(raw).filter(id=>known.has(id));
}


export function togglePinnedProvider(id,raw){
 const ids=normalizePinIds(raw);
 return ids.includes(id)?ids.filter(x=>x!==id):ids.concat(id);
}

export function readPinnedProviders(storage){
 try{return normalizePinIds(JSON.parse(storage?.getItem?.(PIN_KEY)??'[]'));}catch{return [];}
}

export function writePinnedProviders(ids,storage){
 try{storage?.setItem?.(PIN_KEY,JSON.stringify(normalizePinIds(ids)));}catch{/* storage may be unavailable; pins stay session-local */}
 return ids;
}
