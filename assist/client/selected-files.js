import React from 'react';
import {selectedFileOf} from './api.js';
const h=React.createElement;
export function SelectedFiles({input,files,onChange,t}){
 if(!input.occurrences.length)return null;
 return h('details',{className:'lpa-details'},h('summary',null,t('references')),h('p',{className:'lpa-note'},t('fileLimits')),
 input.occurrences.map((occ,index)=>{const entry=selectedFileOf(occ),key=String(occ.occurrenceId??index);return h('div',{className:'lpa-reference',key},entry?h('label',{className:'lpa-check'},h('input',{type:'checkbox',checked:Boolean(files[key]),'aria-label':t('readFile')+': '+entry.name,onChange:e=>onChange(key,e.target.checked?entry:null)}),entry.name,h('span',{className:'lpa-note'},entry.path)):h('span',null,occ.label??t('references'),' · ',t('namesOnly'))); }));
}
