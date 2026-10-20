/** Display metadata only. Identity is an unambiguous pair, never a slash-joined path. */
export const NOTE_MAX=120;
export const EMPTY_NOTES=Object.freeze({});
export function noteKey(provider,model){
 const valid=id=>typeof id==='string'&&id.length>0&&id.length<=512&&!/[\u0000-\u001f\u007f]/.test(id);
 return valid(provider)&&valid(model)?JSON.stringify([provider,model]):'';
}
export function normalizeNoteText(value){return typeof value==='string'?value.replace(/\s+/g,' ').trim():'';}
export function noteFor(notes,provider,model){
 const key=noteKey(provider,model);return key&&notes&&Object.hasOwn(notes,key)&&typeof notes[key]==='string'?notes[key]:'';
}
export function normalizeNotes(value){
 const missing=value.notes===undefined&&value.notesRevision===undefined&&value.notesAvailable===undefined;
 if(missing)return {notes:EMPTY_NOTES,notesRevision:0,notesAvailable:false};
 if(typeof value.notesAvailable!=='boolean'||!Number.isSafeInteger(value.notesRevision)||value.notesRevision<0||!value.notes||typeof value.notes!=='object'||Array.isArray(value.notes))throw Error('invalid-model-notes');
 const entries=Object.entries(value.notes);if(entries.length>500)throw Error('invalid-model-notes');
 for(const [key,text] of entries){
  let pair;try{pair=JSON.parse(key);}catch{throw Error('invalid-model-notes');}
  if(!Array.isArray(pair)||pair.length!==2||noteKey(...pair)!==key||typeof text!=='string'||text.length>NOTE_MAX||normalizeNoteText(text)!==text)throw Error('invalid-model-notes');
 }
 return {notes:Object.freeze(Object.fromEntries(entries)),notesRevision:value.notesRevision,notesAvailable:value.notesAvailable};
}
