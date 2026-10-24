/** Where the model-picker style preference lives: per-machine, applies immediately. */
const KEY='lpa_model_picker_style';
export const MODEL_STYLE_EVENT='lpa-model-style-change';
/** 'dsh' (the host's own picker), 'claude' or 'zcode' (this plugin's pickers). Anything else reads as claude. */
export const MODEL_STYLES=['dsh','claude','zcode'];
export function readModelStylePref(){
 try{const value=localStorage.getItem(KEY);return MODEL_STYLES.includes(value)?value:'claude';}catch{return 'claude';}
}
export function writeModelStylePref(value){
 try{localStorage.setItem(KEY,MODEL_STYLES.includes(value)?value:'claude');}catch{}
 try{window.dispatchEvent(new Event(MODEL_STYLE_EVENT));}catch{}
}
export function onModelStyleChange(listener){
 try{window.addEventListener(MODEL_STYLE_EVENT,listener);return()=>window.removeEventListener(MODEL_STYLE_EVENT,listener);}
 catch{return()=>{};}
}
