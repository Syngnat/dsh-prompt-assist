/** Where the model-picker style preference lives: per-machine, applies immediately. */
const KEY='lpa_model_picker_style';
export const MODEL_STYLE_EVENT='lpa-model-style-change';
/** 'claude' (this plugin's picker) or 'dsh' (the host's own picker). Anything else reads as claude. */
export function readModelStylePref(){
 try{return localStorage.getItem(KEY)==='dsh'?'dsh':'claude';}catch{return 'claude';}
}
export function writeModelStylePref(value){
 try{localStorage.setItem(KEY,value==='dsh'?'dsh':'claude');}catch{}
 try{window.dispatchEvent(new Event(MODEL_STYLE_EVENT));}catch{}
}
export function onModelStyleChange(listener){
 try{window.addEventListener(MODEL_STYLE_EVENT,listener);return()=>window.removeEventListener(MODEL_STYLE_EVENT,listener);}
 catch{return()=>{};}
}
