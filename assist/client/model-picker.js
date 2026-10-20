import React from 'react';
import {createPortal} from 'react-dom';
import {modelDescription} from './model-descriptions.js';
import {pinIdsForSections,readPinnedProviders,togglePinnedProvider,writePinnedProviders} from './model-pin-store.js';
import {pickerCss} from './model-picker-style.js';
import {ClaudeEffortVisual} from './claude-effort-visual.js';

const h=React.createElement;
export const MODEL_SLOT='conversation.input.model';
export const MODEL_PICKER_PRIORITY=-1;
export const modelRowId=(group,model)=>JSON.stringify([group.id,model.id]);
export const providerRowKey=id=>'provider:'+id;
/** Quick providers stay expanded on top; the rest collapse behind provider rows. */
export function splitSections(state,rawPins){
 const sections=sectionsOf(state),pins=pinIdsForSections(rawPins,sections);
 if(!pins.length)return {hero:sections,collapsed:[],pins};
 const pinnedSet=new Set(pins);
 return {hero:pins.map(id=>sections.find(g=>g.id===id)),collapsed:sections.filter(g=>!pinnedSet.has(g.id)),pins};
}
/** Focus order is view-aware: quick top level, or one provider submenu with its back row first. */
export function focusOrderFor(state,pins,view){
 if(busyState(state))return [];
 const {hero,collapsed}=splitSections(state,pins);
 if(view!==null&&view!==undefined){
  const group=[hero,collapsed].flat().find(g=>g?.id===view);
  return group?['back',...modelsOf(group).map(m=>modelRowId(group,m))]:[];
 }
 return [...hero.flatMap(g=>modelsOf(g).map(m=>modelRowId(g,m))),...collapsed.map(g=>providerRowKey(g.id))];
}
export function orderModelProviders(groups){
 const rank=id=>id==='deepseek-account'?0:id==='deepseek-official'?1:2;
 return [...groups].sort((a,b)=>rank(a.id)-rank(b.id));
}
export function modelsOf(group){return (group?.models??[]).filter(m=>m&&typeof m.id==='string').slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
export function sectionsOf(state){return orderModelProviders((state?.groups??[]).filter(g=>g&&typeof g.id==='string'&&modelsOf(g).length));}
export function isCurrentModel(current,selection){return !!current&&current.provider===selection?.provider&&current.model===selection?.model;}
export function currentEntry(state){
 for(const group of sectionsOf(state))for(const model of modelsOf(group))if(isCurrentModel(state.current,{provider:group.id,model:model.id}))return {group,model};
 return null;
}
export function busyState(state){return state?.pending!=null;}
export function loadingState(state){return state?.status==='loading'||state?.status==='idle';}
export function effectiveEffort(entry,current){return current?.reasoningEffort??entry?.model?.reasoning?.defaultEffort;}
/** Fastest to strongest. A provider's advertised scale may arrive in either direction. */
const EFFORT_SCALE=['none','off','minimal','low','medium','high','xhigh','max'];
/**
 * Advertised order is not necessarily a display order: some providers list their
 * levels from the strongest down, which would put the top rung at the fast end of
 * the slider and flip every label. Known levels are re-sorted onto the
 * fastest→strongest scale; a catalog that advertises any custom id keeps exactly
 * the order the Host gave it, because only the provider knows that scale.
 */
export function orderedEfforts(efforts){
 const list=(efforts??[]).filter(item=>item&&typeof item.id==='string');
 const ranks=list.map(item=>EFFORT_SCALE.indexOf(item.id.toLowerCase()));
 if(ranks.some(rank=>rank<0))return list;
 return list.map((item,index)=>({item,rank:ranks[index]})).sort((a,b)=>a.rank-b.rank).map(entry=>entry.item);
}
/** Discrete positions come only from this model's advertised metadata, never a global effort scale. */
export function effortRows(entry,current,defaultLabel,t){
 const reasoning=entry?.model?.reasoning;if(!reasoning)return [];
 const active=effectiveEffort(entry,current), rows=[];
 if(reasoning.defaultEffort===undefined)rows.push({id:'default',effort:undefined,label:defaultLabel,active:active===undefined});
 for(const item of orderedEfforts(reasoning.efforts))if(typeof item?.id==='string'&&!rows.some(r=>r.effort===item.id))rows.push({id:JSON.stringify(item.id),effort:item.id,label:t&&['none','minimal','low','medium','high','xhigh','max'].includes(item.id)?t('picker.level.'+item.id):item.name||item.id,active:item.id===active});
 return rows;
}
export function triggerEffortLabel(state,entry,rows){return rows.find(r=>r.active)?.label??state?.retainedEffort??state?.current?.reasoningEffort??'';}
export function effortSelection(current,rows,index){
 if(!current||!Number.isInteger(index)||index<0||index>=rows.length)return null;
 return {provider:current.provider,model:current.model,...(rows[index].effort===undefined?{}:{reasoningEffort:rows[index].effort})};
}
export function failureRows(state){
 const rows=[];
 if(state?.error)rows.push({id:'load',key:'picker.loadFailed',params:{message:state.error}});
 else if(state?.status==='error')rows.push({id:'load',key:'picker.failed'});
 for(const f of state?.failures??[])rows.push({id:'provider:'+f.id,key:'picker.groupFailed',params:{name:f.name||f.id,message:f.message||''}});
 return rows;
}
export function focusOrder(state){return busyState(state)?[]:sectionsOf(state).flatMap(g=>modelsOf(g).map(m=>modelRowId(g,m)));}
export function menuGeometry(trigger,size,viewport){
 const margin=8,gap=6;
 return {left:Math.max(margin,Math.min(trigger.right-size.width,viewport.width-size.width-margin)),
  top:Math.max(margin,trigger.top-gap-size.height>=margin?trigger.top-gap-size.height:Math.min(trigger.bottom+gap,viewport.height-size.height-margin))};
}
function usePlacement(trigger,panel,open){
 const [position,setPosition]=React.useState(null);
 React.useLayoutEffect(()=>{
  if(!open){setPosition(null);return;}
  const place=()=>{
   const anchor=trigger.current,node=panel.current;if(!anchor||!node)return;
   const rect=anchor.getBoundingClientRect();
   if(!rect.width||!rect.height){setPosition(null);return;}
   const next=menuGeometry(rect,{width:node.offsetWidth,height:node.offsetHeight},{width:innerWidth,height:innerHeight});
   setPosition(old=>old?.left===next.left&&old?.top===next.top?old:next);
  };
  place();const observer=typeof ResizeObserver==='function'?new ResizeObserver(place):null;
  if(panel.current)observer?.observe(panel.current);if(trigger.current)observer?.observe(trigger.current);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return ()=>{observer?.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,trigger,panel]);return position;
}
const gestureKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
/** Preview while dragging; submit once on release. A changed model/catalog/selection cancels the gesture. */
export function EffortSlider({state,entry,disabled,t,submit,sliderRef}){
 const rows=effortRows(entry,state.current,t('picker.providerDefault'),t);
 const active=rows.findIndex(r=>r.active);
 const token=JSON.stringify([state.current,rows.map(r=>r.effort)]);
 const tokenRef=React.useRef(token);tokenRef.current=token;
 const gesture=React.useRef(null),interaction=React.useRef({mode:null,token:null,cancelled:false});
 const [draft,setDraft]=React.useState(null),[pointerPosition,setPointerPosition]=React.useState(null),[landing,setLanding]=React.useState(null);
 const alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 React.useEffect(()=>{if(interaction.current.mode)interaction.current.cancelled=true;gesture.current=null;setDraft(null);setPointerPosition(null);},[token,disabled]);
 React.useEffect(()=>{setLanding(null);},[token]);
 const clear=()=>{gesture.current=null;interaction.current={mode:null,token:null,cancelled:true};setDraft(null);setPointerPosition(null);};
 const commit=()=>{
  const g=gesture.current,cancelled=interaction.current.cancelled;clear();
  if(disabled||cancelled||!g||g.token!==tokenRef.current||g.index===active)return;
  const selection=effortSelection(state.current,rows,g.index);if(!selection)return;
  const pending={index:g.index,token};setLanding(pending);
  const settled=()=>{if(alive.current)setLanding(old=>old===pending?null:old);};
  try{Promise.resolve(submit(selection,false)).then(settled,settled);}catch{settled();}
 };
 const pointerRatio=e=>{const node=e.currentTarget,rect=node.getBoundingClientRect(),scale=rect.width/Math.max(1,node.clientWidth);return Math.max(0,Math.min(1,(e.clientX-rect.left-8*scale)/Math.max(1,rect.width-16*scale)));};
 if(!rows.length)return null;
 const preview=landing?.token===token?landing.index:gesture.current?.token===token?draft:null;
 const index=preview??Math.max(0,active),max=Math.max(0,rows.length-1);
 const position=interaction.current.token===token&&!interaction.current.cancelled?pointerPosition:null;
 const label=preview!==null?rows[index]?.label:active<0?t('picker.effortUnavailable'):rows[active].label;
 return h(ClaudeEffortVisual,{rows,index,position,dragging:position!==null,disabled:disabled||rows.length<2,unknown:active<0&&preview===null,label,t},
  h('input',{ref:sliderRef,type:'range',className:'lpa-ce-input',min:0,max,step:1,value:index,disabled:disabled||rows.length<2,
   'aria-label':t('picker.effort'),'aria-valuetext':label,
   onChange:e=>{const current=interaction.current;if(disabled||current.cancelled||(current.mode&&current.token!==token))return;const next=Number(e.currentTarget.value);gesture.current={token,index:next};setDraft(next);},
   onPointerDown:e=>{if(disabled||e.button!==0)return;interaction.current={mode:'pointer',token,cancelled:false};gesture.current={token,index:Number(e.currentTarget.value)};setPointerPosition(pointerRatio(e));e.currentTarget.setPointerCapture?.(e.pointerId);},
   onPointerMove:e=>{const current=interaction.current;if(!disabled&&current.mode==='pointer'&&!current.cancelled&&current.token===token)setPointerPosition(pointerRatio(e));},
   onPointerUp:commit,onPointerCancel:clear,onBlur:clear,
   onKeyDown:e=>{if(gestureKeys.includes(e.key)){e.stopPropagation();if(!interaction.current.mode)interaction.current={mode:'key',token,cancelled:false};}if(e.key==='Escape')clear();},
   onKeyUp:e=>{if(gestureKeys.includes(e.key)){e.stopPropagation();commit();}},
  }));
}

/** Sandboxed documents may deny the localStorage property itself; pins degrade to session state. */
const safeStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}};

/** One session-owned slot component. No document scanning, foreign DOM mutation or private model RPC. */
export function ModelPicker({locked,available,directory,load,select,t,getLocale=()=> 'en'}){
 const state=React.useSyncExternalStore(React.useCallback(fn=>directory.subscribe(fn),[directory]),()=>directory.getSnapshot(),()=>directory.getSnapshot());
 const [open,setOpen]=React.useState(false),[error,setError]=React.useState(null),[submitting,setSubmitting]=React.useState(false);
 const [pinsStored,setPinsStored]=React.useState(()=>readPinnedProviders(safeStorage()));
 const [view,setView]=React.useState(null);
 const trigger=React.useRef(null),panel=React.useRef(null),slider=React.useRef(null),rowRefs=React.useRef(new Map());
 const lifecycle=React.useRef({alive:true,source:directory,epoch:0,open:false,operation:0,inflight:false});
 const focusRequest=React.useRef(null),focusRecovery=React.useRef(null),modelFocus=React.useRef(null),id=React.useId();
 const life=lifecycle.current;life.source=directory;
 const visible=open&&available&&!locked,entry=currentEntry(state),failures=failureRows(state);
 const busy=busyState(state)||submitting,position=usePlacement(trigger,panel,visible);
 React.useEffect(()=>{life.alive=true;setOpen(false);setError(null);setSubmitting(false);life.inflight=false;life.epoch++;return()=>{life.alive=false;life.epoch++;};},[directory,life]);
 React.useEffect(()=>{if(!available||locked){life.open=false;life.epoch++;setOpen(false);}},[available,locked,life]);
 const hide=(restore=false)=>{life.open=false;life.epoch++;setOpen(false);focusRequest.current=null;setView(null);if(restore)trigger.current?.focus();};
 const openProvider=id=>{setView(id);focusRequest.current='back';};
 const exitProvider=()=>{focusRequest.current=view!==null?providerRowKey(view):null;setView(null);};
 const togglePin=id=>{const {pins}=splitSections(state,pinsStored);const next=togglePinnedProvider(id,pins);setPinsStored(next);writePinnedProviders(next,safeStorage());};
 const {hero,collapsed,pins}=splitSections(state,pinsStored);
 const focusRow=key=>{const node=rowRefs.current.get(key);if(node&&!node.disabled){modelFocus.current=key;node.focus({preventScroll:true});node.scrollIntoView({block:'nearest'});return true;}return false;};
 React.useLayoutEffect(()=>{
  const saved=focusRecovery.current;if(!saved||busy)return;focusRecovery.current=null;
  if(!visible||saved.source!==directory||saved.epoch!==life.epoch||!life.open)return;
  if(document.activeElement!==document.body&&document.activeElement!==document.documentElement)return;
  if(saved.node?.isConnected&&!saved.node.disabled)saved.node.focus({preventScroll:true});
  else if(!focusRow(modelFocus.current))panel.current?.querySelector('button:not(:disabled),input:not(:disabled)')?.focus();
 },[busy,visible,directory,life]);
 React.useLayoutEffect(()=>{
  if(!visible||!position||!focusRequest.current)return;
  const order=focusOrderFor(state,pins,view),wanted=focusRequest.current==='last'?order.at(-1):order[0];
  if(focusRow(wanted)){focusRequest.current=null;return;}
  if(!loadingState(state)){panel.current?.querySelector('button:not(:disabled),input:not(:disabled)')?.focus();focusRequest.current=null;}
 },[visible,position,state,view,pins]);
 React.useLayoutEffect(()=>{panel.current?.querySelector('.lpa-model-scroll')?.scrollTo?.(0,0);},[view]);
 React.useLayoutEffect(()=>{if(view!==null&&![...sectionsOf(state)].some(g=>g.id===view))setView(null);},[view,state]);
 React.useEffect(()=>{
  if(!visible)return;
  const outside=e=>{if(!trigger.current?.contains(e.target)&&!panel.current?.contains(e.target))hide();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);};
 },[visible]);
 const reload=()=>{const source=directory,epoch=life.epoch;const failed=()=>{if(life.alive&&life.source===source&&life.epoch===epoch&&life.open)setError('model-failed');};setError(null);try{Promise.resolve(load()).catch(failed);}catch{failed();}};
 const show=(focus='first')=>{if(locked||!available)return;life.epoch++;life.open=true;focusRequest.current=focus;setOpen(true);reload();};
 const submit=(selection,closeOnSuccess=true)=>{
  if(locked||!available||life.inflight||busyState(directory.getSnapshot()))return;
  life.inflight=true;setSubmitting(true);setError(null);
  const epoch=life.epoch,source=directory,operation=++life.operation;
  focusRecovery.current=panel.current?.contains(document.activeElement)?{source,epoch,node:document.activeElement}:null;
  return Promise.resolve().then(()=>select(selection)).then(result=>{
   if(!life.alive||life.source!==source||life.operation!==operation)return;
   if(life.open&&life.epoch===epoch){
    if(result?.ok!==true)setError(result?.error?.code??'model-failed');
    else if(closeOnSuccess)hide(true);
   }
  },()=>{if(life.alive&&life.source===source&&life.open&&life.epoch===epoch)setError('model-failed');}).finally(()=>{
   if(life.alive&&life.source===source&&life.operation===operation){life.inflight=false;setSubmitting(false);}
  });
 };
 const pick=(group,model)=>{
  if(locked||busy||life.inflight)return;
  const current=directory.getSnapshot().current;
  if(isCurrentModel(current,{provider:group.id,model:model.id})){hide(true);return;}
  submit({provider:group.id,model:model.id,...(model.reasoning?.defaultEffort===undefined?{}:{reasoningEffort:model.reasoning.defaultEffort})});
 };
 const onKeyDown=e=>{
  if(e.nativeEvent.isComposing)return;
  if(view!==null&&(e.key==='Escape'||e.key==='ArrowLeft'||e.key==='Backspace')&&e.target!==slider.current){e.preventDefault();e.stopPropagation();exitProvider();return;}
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide(true);return;}
  if(e.key==='Tab'){
   const retry=panel.current?.querySelector('.lpa-model-retry:not(:disabled)');
   const extras=[retry,slider.current&&!slider.current.disabled?slider.current:null].filter(Boolean);
   const at=extras.indexOf(e.target);
   if(!e.shiftKey&&at+1<extras.length){e.preventDefault();extras[at+1].focus();return;}
   if(e.shiftKey&&at>0){e.preventDefault();extras[at-1].focus();return;}
   if(e.shiftKey&&at===0&&focusOrderFor(state,pins,view).length){e.preventDefault();if(!focusRow(modelFocus.current))focusRow(focusOrderFor(state,pins,view)[0]);return;}
   hide(true);return;
  }
  if(e.target===slider.current)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();e.stopPropagation();const order=focusOrderFor(state,pins,view);if(busy||!order.length)return;
   const key=document.activeElement?.getAttribute('data-picker-row'),at=order.indexOf(key);
   const next=e.key==='Home'?0:e.key==='End'?order.length-1:at<0?(e.key==='ArrowUp'?order.length-1:0):(at+(e.key==='ArrowDown'?1:-1)+order.length)%order.length;
   focusRow(order[next]);
  }
 };
 if(!available)return null;
 const rows=effortRows(entry,state.current,t('picker.providerDefault'),t);
 const effort=triggerEffortLabel(state,entry,rows);
 const caption=entry?.model.name||entry?.model.id||state.current?.model||(loadingState(state)?t('picker.loading'):t('picker.fallback'));
 const viewGroup=view!==null?[...hero,...collapsed].find(g=>g.id===view):null;
 const renderModels=group=>modelsOf(group).map(model=>{
  const key=modelRowId(group,model),checked=isCurrentModel(state.current,{provider:group.id,model:model.id});
  const description=modelDescription(group.id,model,getLocale());
  return h('button',{key,type:'button',role:'menuitemradio','aria-checked':checked,tabIndex:-1,disabled:busy||locked,
   'data-picker-row':key,'data-provider-id':group.id,'data-model-id':model.id,
   ref:node=>{if(node)rowRefs.current.set(key,node);else rowRefs.current.delete(key);},
   className:'lpa-model-option'+(checked?' lpa-model-option--current':''),onFocus:()=>{modelFocus.current=key;},onClick:()=>pick(group,model)},
   h('span',{className:'lpa-model-copy'},h('span',{className:'lpa-model-name'},model.name||model.id),description?h('span',{className:'lpa-model-desc'},description):null),
   checked?h('span',{className:'lpa-model-check','aria-hidden':true},'✓'):null);
 });
 const groupHeader=group=>h('div',{className:'lpa-model-group-name',title:group.id},
  h('span',null,group.id==='deepseek-account'?t('picker.account'):group.name||group.id),
  h('button',{type:'button',className:'lpa-model-pin',title:pins.includes(group.id)?t('picker.unpin'):t('picker.pin'),'aria-pressed':pins.includes(group.id),
   'aria-label':pins.includes(group.id)?t('picker.unpin'):t('picker.pin'),onClick:()=>togglePin(group.id)},
   h('span',{'aria-hidden':true},pins.includes(group.id)?t('picker.pinnedMark'):t('picker.pinMark'))));
 const backRow=h('button',{key:'back',type:'button',role:'menuitem','data-picker-row':'back','aria-label':t('picker.allProviders'),tabIndex:-1,
  ref:node=>{if(node)rowRefs.current.set('back',node);else rowRefs.current.delete('back');},
  className:'lpa-model-back-row',onClick:exitProvider,disabled:busy||locked},
  h('span',{className:'lpa-model-back-chevron','aria-hidden':true},'‹'),h('span',null,t('picker.allProviders')));
 const providerRow=group=>{
  const key=providerRowKey(group.id),current=state.current?.provider===group.id;
  return h('button',{key,type:'button',role:'menuitem','aria-label':t('picker.providerRow',{name:group.name||group.id,count:modelsOf(group).length}),
   tabIndex:-1,disabled:busy||locked,'data-picker-row':key,'data-provider-id':group.id,
   ref:node=>{if(node)rowRefs.current.set(key,node);else rowRefs.current.delete(key);},
   className:'lpa-model-provider-row'+(current?' lpa-model-provider-row--current':''),
   onFocus:()=>{modelFocus.current=key;},onClick:()=>{if(!busy&&!locked)openProvider(group.id);},
   onKeyDown:e=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();openProvider(group.id);}}},
   h('span',{className:'lpa-model-provider-copy'},h('span',{className:'lpa-model-provider-name'},group.name||group.id)),
   h('span',{className:'lpa-model-provider-meta'},
    current?h('span',{className:'lpa-model-check','aria-hidden':true},'✓'):null,
    h('span',{className:'lpa-model-provider-count'},String(modelsOf(group).length)),
    h('span',{className:'lpa-model-provider-chevron','aria-hidden':true},'›')));
 };
 const menu=visible?h('div',{ref:panel,id:id+'-panel',className:'lpa-model-menu',role:'dialog','aria-label':t('picker.aria'),'aria-busy':busy||loadingState(state),
  style:position??{left:0,top:0,visibility:'hidden'},onKeyDown},
  h('div',{className:'lpa-model-scroll',role:'menu','aria-label':t('picker.models')},
   viewGroup?[backRow,h('section',{key:viewGroup.id,className:'lpa-model-group',role:'group','aria-label':viewGroup.name||viewGroup.id},groupHeader(viewGroup),renderModels(viewGroup))]:
    [...hero.map(group=>h('section',{key:group.id,className:'lpa-model-group',role:'group','aria-label':group.name||group.id},groupHeader(group),renderModels(group))),
     collapsed.length?h('div',{key:'more',className:'lpa-model-more'},collapsed.map(group=>providerRow(group))):null],
   !hero.length&&!collapsed.length?h('p',{className:'lpa-model-status',role:'status'},loadingState(state)?t('picker.loading'):t('picker.empty')):null),
  failures.length?h('div',{className:'lpa-model-failures'},failures.map(f=>h('p',{key:f.id,className:'lpa-model-status',role:'status'},t(f.key,f.params))),
   h('button',{type:'button',className:'lpa-model-retry',onClick:reload,disabled:busy||loadingState(state)},t('picker.retry'))):null,
  rows.length?h('div',{className:'lpa-effort-frame'},h(EffortSlider,{key:JSON.stringify([state.current?.provider,state.current?.model]),state,entry,disabled:busy||locked,t,submit,sliderRef:slider})):null,
  error?h('p',{className:'lpa-model-error',role:'alert'},t(error==='session/writer-held'?'picker.sessionInUse':'picker.failed')):null,
  busy?h('span',{className:'lpa-model-status',role:'status'},t('picker.saving')):null):null;
 return h(React.Fragment,null,h('style',null,pickerCss),
  h('div',{className:'lpa-model-root'},h('button',{ref:trigger,type:'button',className:'lpa-model-trigger',disabled:!!locked,
   'aria-haspopup':'dialog','aria-expanded':visible,'aria-controls':visible?id+'-panel':undefined,'aria-busy':busy,
   'aria-label':t('picker.ariaCurrent',{model:caption}),title:[caption,effort].filter(Boolean).join(' · '),
   onClick:()=>visible?hide(true):show(),onKeyDown:e=>{if(visible){onKeyDown(e);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show(e.key==='ArrowUp'?'last':'first');}}},
   h('span',{className:'lpa-model-trigger-icon','aria-hidden':true},'◇'),h('span',{className:'lpa-model-trigger-label'},caption),
   effort?h('span',{className:'lpa-model-trigger-effort'},effort):null,h('span',{className:'lpa-model-chevron','aria-hidden':true}))),
  menu?createPortal(menu,document.body):null);
}
