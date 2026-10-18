/** Protocol-only validation. This is not a semantic classifier for user intent. */
export function isNoSuggestionPlaceholder(text) {
 return typeof text==='string'&&/^(?:暂无(?:下一问)?建议|no suggestions?(?: available)?)[。.!！]?$/iu.test(text.trim());
}
export function parseSuggestionOutput(raw) {
 const invalid=()=>Object.assign(new Error('invalid-suggestion'),{code:'invalid-suggestion'});
 let value;
 try{if(typeof raw!=='string'||raw.length>65536)throw invalid();value=JSON.parse(raw);}catch{throw invalid();}
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
 const keys=Object.keys(value);
 if(value.kind==='none'&&keys.length===1)return {outcome:'no-suggestion',text:''};
 if(value.kind==='suggestion'&&keys.length===2&&typeof value.text==='string'&&value.text.trim()&&!isNoSuggestionPlaceholder(value.text))return {outcome:'suggestion',text:value.text.trim()};
 throw invalid();
}
