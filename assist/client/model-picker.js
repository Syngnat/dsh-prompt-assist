import React from 'react';
import {createPortal} from 'react-dom';
import {modelDescription} from './model-descriptions.js';
import {pinIdsForSections,readPinnedProviders,togglePinnedProvider,writePinnedProviders} from './model-pin-store.js';
import {pickerCss} from './model-picker-style.js';
import {readModelStylePref,onModelStyleChange} from './model-style-pref.js';
import {ClaudeEffortVisual} from './claude-effort-visual.js';
import {ZcodeEffortVisual,isGlmHighspeedModel} from './zcode-effort-visual.js';

const h=React.createElement;
export const MODEL_SLOT='conversation.input.model';
export const MODEL_PICKER_PRIORITY=-1;
export const modelRowId=(group,model)=>JSON.stringify([group.id,model.id]);
export const OTHER_MODELS='other-models';
export const providerRowKey=id=>'provider:'+id;
/** Quick providers stay expanded on top. Unpinned providers fold into one other-models group. */
export function splitSections(state,rawPins){
 const sections=sectionsOf(state),pins=pinIdsForSections(rawPins,sections);
 if(!pins.length)return {hero:sections,collapsed:[],pins};
 const pinnedSet=new Set(pins);
 return {hero:pins.map(id=>sections.find(g=>g.id===id)),collapsed:sections.filter(g=>!pinnedSet.has(g.id)),pins};
}
/** Models inside the other-models group, in the catalog's provider order. */
export function otherModelsOf(collapsed){
 return (collapsed??[]).flatMap(group=>modelsOf(group).map(model=>({group,model})));
}
/** Focus order is view-aware: quick top level, or the other-models list with its back row first. */
export function focusOrderFor(state,pins,view){
 if(busyState(state))return [];
 const {hero,collapsed}=splitSections(state,pins);
 if(view===OTHER_MODELS)return collapsed.length?otherModelsOf(collapsed).map(({group,model})=>modelRowId(group,model)):[];
 if(view!==null&&view!==undefined)return [];
 return [...hero.flatMap(g=>modelsOf(g).map(m=>modelRowId(g,m))),...(collapsed.length?[providerRowKey(OTHER_MODELS)]:[])];
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
/** Browsing a provider is independent of committing a model route. Resolve by stable provider id. */
export function zcodeProviderFor(state,viewedProviderId){
 const groups=sectionsOf(state);
 return groups.find(group=>group.id===viewedProviderId)??groups.find(group=>group.id===state?.current?.provider)??groups[0]??null;
}
export function busyState(state){return state?.pending!=null;}
export function loadingState(state){return state?.status==='loading'||state?.status==='idle';}
export function effectiveEffort(entry,current){return current?.reasoningEffort??entry?.model?.reasoning?.defaultEffort;}
/**
 * A model switch keeps the current reasoning level only when the new model
 * advertises it. Otherwise the field stays out of the selection, so the Host
 * falls back to that model's own default instead of this plugin guessing one.
 */
export function carriedEffort(model,current){
 const effort=current?.reasoningEffort;
 if(!effort)return undefined;
 return (model?.reasoning?.efforts??[]).some(level=>level?.id===effort)?effort:undefined;
}
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
 const list=(efforts??[]).filter(item=>item&&typeof item.id==='string'&&item.id);
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
/**
 * An empty or whitespace-only label (a provider catalog may ship a nameless custom
 * level, or a language pack may blank a known one) must not swallow the trigger's
 * whole effort display: `??` cannot see past an empty string, so empty labels are
 * skipped here and the state's own effort evidence still renders.
 */
export function triggerEffortLabel(state,entry,rows){const shown=value=>typeof value==='string'&&value.trim()?value:undefined;return shown(rows.find(r=>r.active)?.label)??shown(state?.retainedEffort)??shown(state?.current?.reasoningEffort)??'';}
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
 /** Frozen while open: a committed effort label widens the trigger and would otherwise move the menu. */
 const frozen=React.useRef(null);
 React.useLayoutEffect(()=>{
  if(!open){setPosition(null);frozen.current=null;return;}
  const place=()=>{
   const anchor=trigger.current,node=panel.current;if(!anchor||!node)return;
   const rect=anchor.getBoundingClientRect();
   if(!rect.width||!rect.height){setPosition(null);return;}
   const live=frozen.current;
   // Re-anchor only when the trigger really moved (scroll/resize). A width-only change from the
   // effort label keeps the original anchor so the open menu does not jump sideways.
   if(!live||Math.abs(rect.top-live.top)>.5||Math.abs(rect.bottom-live.bottom)>.5||Math.abs(rect.right-live.right)>.5)
    frozen.current={top:rect.top,bottom:rect.bottom,right:rect.right,left:rect.left,width:rect.width,height:rect.height};
   const placed=frozen.current;
   const next=menuGeometry(placed,{width:node.offsetWidth,height:node.offsetHeight},{width:innerWidth,height:innerHeight});
   setPosition(old=>old?.left===next.left&&old?.top===next.top?old:next);
  };
  place();const observer=typeof ResizeObserver==='function'?new ResizeObserver(place):null;
  if(panel.current)observer?.observe(panel.current);if(trigger.current)observer?.observe(trigger.current);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return ()=>{observer?.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,trigger,panel]);return position;
}
/** The other-models flyout hugs the row on its right, flipping left only when there is no room. */
function useFlyout(rowRef,panelRef,open){
 const [position,setPosition]=React.useState(null);
 React.useLayoutEffect(()=>{
  if(!open){setPosition(null);return;}
  const place=()=>{
   const anchor=rowRef.current,node=panelRef.current;if(!anchor||!node)return;
   const rect=anchor.getBoundingClientRect();
   if(!rect.width||!rect.height){setPosition(null);return;}
   const margin=8,gap=6;
   const width=node.offsetWidth,height=node.offsetHeight;
   const menu=rowRef.current?.closest('.lpa-model-menu')?.getBoundingClientRect();
   // Prefer the row's right edge; when the menu itself is pinned to the viewport edge,
   // fall back to hugging the menu and only then mirror to its left.
   const beside=rect.right+gap+width<=innerWidth-margin;
   const left=beside?rect.right+gap
    :menu&&menu.right+gap+width<=innerWidth-margin?menu.right+gap
    :Math.max(margin,Math.min(rect.left-gap-width,menu?menu.left-gap-width:rect.left-gap-width));
   // The flyout tracks the menu column: same top edge, and never taller than the menu
   // it belongs to, so the two lists read as one pair instead of a stub pinned to the row.
   const top=menu?Math.max(margin,Math.min(menu.top,innerHeight-margin-180)):Math.max(margin,rect.top);
   const room=Math.max(180,innerHeight-top-margin),span=menu?menu.height:room;
   const maxHeight=Math.max(180,Math.min(span,room));
   setPosition(old=>old?.left===left&&old?.top===top&&old?.maxHeight===maxHeight?old:{left,top,maxHeight});
  };
  // Placement reads layout, so it is throttled to one frame and never runs for scrolls that
  // happen inside these two lists: the flyout is anchored to the menu, not to the row, so an
  // inner scroll changes nothing but would otherwise re-render the whole picker per frame.
  let frame=0;
  const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;place();});};
  const onScroll=event=>{const target=event.target;
  if(target instanceof Node&&((panelRef.current&&panelRef.current.contains(target))||rowRef.current?.closest('.lpa-model-menu')?.contains(target)))return;
  schedule();};
  place();
  // Observing the flyout itself would loop: its height is what this effect writes.
  const menuEl=rowRef.current?.closest('.lpa-model-menu');
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  if(menuEl)observer?.observe(menuEl);if(rowRef.current)observer?.observe(rowRef.current);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',onScroll,true);
  return()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();
  window.removeEventListener('resize',schedule);window.removeEventListener('scroll',onScroll,true);};
 },[open,rowRef,panelRef]);return position;
}
const gestureKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
/** Preview while dragging; submit once on release. A changed model/catalog/selection cancels the gesture. */
export function EffortSlider({state,entry,disabled,t,submit,sliderRef,Visual=ClaudeEffortVisual,inputClass='lpa-ce-input',highspeed=false}){
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
  // Keep the target position until the committed state arrives: clearing it on acknowledgement
  // snapped the visual back to the previous stop for the host round-trip (flicker + jump).
  const settled=result=>{if(alive.current&&result?.ok!==true)setLanding(old=>old===pending?null:old);};
  try{Promise.resolve(submit(selection,false,true)).then(settled,()=>settled({ok:false}));}catch{settled({ok:false});}
 };
 const pointerRatio=e=>{const node=e.currentTarget,rect=node.getBoundingClientRect(),scale=rect.width/Math.max(1,node.clientWidth);return Math.max(0,Math.min(1,(e.clientX-rect.left-8*scale)/Math.max(1,rect.width-16*scale)));};
 if(!rows.length)return null;
 const preview=landing?.token===token?landing.index:gesture.current?.token===token?draft:null;
 const index=preview??Math.max(0,active),max=Math.max(0,rows.length-1);
 const position=interaction.current.token===token&&!interaction.current.cancelled?pointerPosition:null;
 const label=preview!==null?rows[index]?.label:active<0?t('picker.effortUnavailable'):rows[active].label;
 return h(Visual,{rows,index,position,dragging:position!==null,disabled:disabled||rows.length<2,unknown:active<0&&preview===null,highspeed,label,t},
  h('input',{ref:sliderRef,type:'range',className:inputClass,min:0,max,step:1,value:index,disabled:disabled||rows.length<2,
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
/** Opaque fallbacks derived from the host's own body paint: the menu never goes transparent, even when a theme plugin removes or translucifies the surface tokens. */
const menuSurfaceVars=()=>{try{const paint=getComputedStyle(document.body),bg=paint.backgroundColor,fore=paint.color;
 if(bg&&bg!=='transparent'&&bg!=='rgba(0, 0, 0, 0)')return {'--lpa-menu-base':bg,'--lpa-menu-fore':fore};}catch{}return {};};

/** One session-owned slot component. No document scanning, foreign DOM mutation or private model RPC. */
export function ModelPicker({locked,available,directory,load,select,t,getLocale=()=> 'en'}){
 const state=React.useSyncExternalStore(React.useCallback(fn=>directory.subscribe(fn),[directory]),()=>directory.getSnapshot(),()=>directory.getSnapshot());
 const [open,setOpen]=React.useState(false),[error,setError]=React.useState(null),[submitting,setSubmitting]=React.useState(false);
 const [pinsStored,setPinsStored]=React.useState(()=>readPinnedProviders(safeStorage()));
 const [otherOpen,setOtherOpen]=React.useState(false);
 const [providerView,setProviderView]=React.useState(null);
 const [viewedProviderId,setViewedProviderId]=React.useState(null);
 /** True while an effort-only submit runs: the menu must not gain a progress row (it changed the popup height). */
 const [silentSubmit,setSilentSubmit]=React.useState(false);
 const [styleTick,refreshStyleTick]=React.useState(0);
 React.useEffect(()=>onModelStyleChange(()=>refreshStyleTick(v=>v+1)),[]);
 const trigger=React.useRef(null),panel=React.useRef(null),slider=React.useRef(null),rowRefs=React.useRef(new Map());
 const otherRowRef=React.useRef(null),flyoutRef=React.useRef(null);
 const lifecycle=React.useRef({alive:true,source:directory,epoch:0,open:false,operation:0,inflight:false});
 const focusRequest=React.useRef(null),focusRecovery=React.useRef(null),modelFocus=React.useRef(null),id=React.useId();
 const life=lifecycle.current;life.source=directory;
 const visible=open&&available&&!locked,entry=currentEntry(state),failures=failureRows(state);
 const busy=busyState(state)||submitting,position=usePlacement(trigger,panel,visible);
 React.useEffect(()=>{life.alive=true;setOpen(false);setProviderView(null);setViewedProviderId(null);setError(null);setSubmitting(false);life.inflight=false;life.epoch++;return()=>{life.alive=false;life.epoch++;};},[directory,life]);
 React.useEffect(()=>{if(!available||locked){life.open=false;life.epoch++;setOpen(false);setProviderView(null);setViewedProviderId(null);}},[available,locked,life]);
 const hide=(restore=false)=>{life.open=false;life.epoch++;setOpen(false);focusRequest.current=null;setOtherOpen(false);setProviderView(null);setViewedProviderId(null);if(restore)trigger.current?.focus();};
 const togglePin=id=>{const {pins}=splitSections(state,pinsStored);const next=togglePinnedProvider(id,pins);setPinsStored(next);writePinnedProviders(next,safeStorage());};
 /** A short grace period lets the pointer travel from the row into the panel without flicker. */
 // The other-models panel opens on click only: a hover-opened panel vanished while the
 // pointer travelled into it, which made its options impossible to pick.
 const {hero,collapsed,pins}=splitSections(state,pinsStored);
 const style=readModelStylePref(),zcode=style==='zcode';
 const zcSections=sectionsOf(state);
 const zcGroup=zcodeProviderFor(state,viewedProviderId);
 /** The header already names the viewed provider, so the switch list never repeats it. */
 const zcOthers=zcGroup?zcSections.filter(group=>group.id!==zcGroup.id):zcSections;
 const zcSwitchable=zcOthers.length>0;
 // The header and a provider option are distinct focus targets, even when they show the same provider.
 const zcHeaderKey=zcGroup?'zc-provider':null;
 /** ZCode navigation is view-based: the provider list, or the viewed provider's models. */
 const zcFocusOrder=()=>providerView?[...zcOthers.map(g=>providerRowKey(g.id)),'zc-back']:(zcGroup?[...(zcSwitchable?[zcHeaderKey]:[]),...modelsOf(zcGroup).map(m=>modelRowId(zcGroup,m))]:[]);
 const orderForFocus=()=>zcode?zcFocusOrder():focusOrderFor(state,pins,null);
 const focusRow=key=>{const node=rowRefs.current.get(key);if(node&&!node.disabled){modelFocus.current=key;node.focus({preventScroll:true});node.scrollIntoView({block:'nearest'});return true;}return false;};
 React.useLayoutEffect(()=>{
  if(viewedProviderId===null||zcGroup?.id===viewedProviderId)return;
  // Catalog refresh can remove the browsed group and its focused row. Clear the stale id
  // and restore an in-menu focus target, but never take focus from another control.
  const active=document.activeElement;
  if(visible&&life.open&&(active===document.body||active===document.documentElement||panel.current?.contains(active)))focusRequest.current='first';
  setViewedProviderId(null);
 },[visible,viewedProviderId,zcGroup?.id,life]);
 React.useLayoutEffect(()=>{
  const saved=focusRecovery.current;if(!saved||busy)return;focusRecovery.current=null;
  if(!visible||saved.source!==directory||saved.epoch!==life.epoch||!life.open)return;
  if(document.activeElement!==document.body&&document.activeElement!==document.documentElement)return;
  if(saved.node?.isConnected&&!saved.node.disabled)saved.node.focus({preventScroll:true});
  else if(!focusRow(modelFocus.current))panel.current?.querySelector('button:not(:disabled),input:not(:disabled)')?.focus();
 },[busy,visible,directory,life]);
 React.useLayoutEffect(()=>{
  if(!visible||!position||!focusRequest.current)return;
  const order=orderForFocus(),wanted=focusRequest.current==='last'?order.at(-1):order[0];
  if(focusRow(wanted)){focusRequest.current=null;return;}
  if(!loadingState(state)){panel.current?.querySelector('button:not(:disabled),input:not(:disabled)')?.focus();focusRequest.current=null;}
 },[visible,position,state,pins,providerView,viewedProviderId,zcode]);
 React.useLayoutEffect(()=>{if(!collapsed.length)setOtherOpen(false);},[collapsed.length]);
 React.useLayoutEffect(()=>{if(zcode&&providerView&&!zcSwitchable)setProviderView(false);},[zcode,providerView,zcSwitchable]);
 React.useEffect(()=>{
  if(!visible)return;
  const outside=e=>{if(!trigger.current?.contains(e.target)&&!panel.current?.contains(e.target)&&!flyoutRef.current?.contains(e.target)){setOtherOpen(false);hide();}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);};
 },[visible]);
 const reload=()=>{const source=directory,epoch=life.epoch;const failed=()=>{if(life.alive&&life.source===source&&life.epoch===epoch&&life.open)setError('model-failed');};setError(null);try{Promise.resolve(load()).catch(failed);}catch{failed();}};
 const show=(focus='first')=>{if(locked||!available)return;life.epoch++;life.open=true;focusRequest.current=focus;setOpen(true);reload();};
 const submit=(selection,closeOnSuccess=true,quiet=false)=>{
  if(locked||!available||life.inflight||busyState(directory.getSnapshot()))return;
  life.inflight=true;setSubmitting(true);setSilentSubmit(quiet);setError(null);
  const epoch=life.epoch,source=directory,operation=++life.operation;
  focusRecovery.current=panel.current?.contains(document.activeElement)?{source,epoch,node:document.activeElement}:null;
  return Promise.resolve().then(()=>select(selection)).then(result=>{
   if(!life.alive||life.source!==source||life.operation!==operation)return;
   if(life.open&&life.epoch===epoch){
    if(result?.ok!==true)setError(result?.error?.code??'model-failed');
    else if(closeOnSuccess)hide(true);
   }
  },()=>{if(life.alive&&life.source===source&&life.open&&life.epoch===epoch)setError('model-failed');}).finally(()=>{
   if(life.alive&&life.source===source&&life.operation===operation){life.inflight=false;setSubmitting(false);setSilentSubmit(false);}
  });
 };
 const pick=(group,model)=>{
  if(locked||busy||life.inflight)return;
  const current=directory.getSnapshot().current;
  if(isCurrentModel(current,{provider:group.id,model:model.id})){hide(true);return;}
  const effort=carriedEffort(model,current);
  submit({provider:group.id,model:model.id,...(effort===undefined?{}:{reasoningEffort:effort})});
 };
 const onKeyDown=e=>{
  if(e.nativeEvent.isComposing)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide(true);return;}
  if(e.key==='Tab'){
   const retry=panel.current?.querySelector('.lpa-model-retry:not(:disabled)');
   const extras=[retry,slider.current&&!slider.current.disabled?slider.current:null].filter(Boolean);
   const at=extras.indexOf(e.target);
   if(!e.shiftKey&&at+1<extras.length){e.preventDefault();extras[at+1].focus();return;}
   if(e.shiftKey&&at>0){e.preventDefault();extras[at-1].focus();return;}
   if(e.shiftKey&&at===0&&orderForFocus().length){e.preventDefault();if(!focusRow(modelFocus.current))focusRow(orderForFocus()[0]);return;}
   hide(true);return;
  }
  if(e.target===slider.current)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();e.stopPropagation();const order=orderForFocus();if(busy||!order.length)return;
   const key=document.activeElement?.getAttribute('data-picker-row'),at=order.indexOf(key);
   const next=e.key==='Home'?0:e.key==='End'?order.length-1:at<0?(e.key==='ArrowUp'?order.length-1:0):(at+(e.key==='ArrowDown'?1:-1)+order.length)%order.length;
   focusRow(order[next]);
  }
 };
 // Keep hook order stable when a session becomes unavailable or the picker style changes.
 const flyout=useFlyout(otherRowRef,flyoutRef,visible&&!zcode&&otherOpen&&collapsed.length>0);
 if(!available)return null;
 if(styleTick>=0&&readModelStylePref()==='dsh')return h('div',{className:'lpa-model-root'},
  h('style',null,'.lpa-model-native{font:inherit;font-size:13px;max-width:min(320px,52cqw);height:28px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,ButtonFace);border:1px solid var(--dsw-alias-border-l1,#80808066);border-radius:7px;padding:0 4px;cursor:pointer}'),
  h('select',{className:'lpa-model-native',disabled:busy||locked||loadingState(state),'aria-label':t('picker.aria'),
   value:modelRowId({id:state.current?.provider??''},{id:state.current?.model??''}),
   onChange:e=>{let picked;try{picked=JSON.parse(e.target.value);}catch{return;}const group=sectionsOf(state).find(g=>g.id===picked[0]);const model=group?modelsOf(group).find(m=>m.id===picked[1]):null;if(group&&model)pick(group,model);}},
   sectionsOf(state).length===0?h('option',{value:''},loadingState(state)?t('picker.loading'):t('picker.empty')):null,
   sectionsOf(state).map(group=>h('optgroup',{key:group.id,label:group.name||group.id},modelsOf(group).map(model=>h('option',{key:modelRowId(group,model),value:modelRowId(group,model)},model.name||model.id))))));
 const rows=effortRows(entry,state.current,t('picker.providerDefault'),t);
 const effort=triggerEffortLabel(state,entry,rows);
 const caption=entry?.model.name||entry?.model.id||state.current?.model||(loadingState(state)?t('picker.loading'):t('picker.fallback'));
 const otherCount=otherModelsOf(collapsed).length;
 const renderModels=group=>modelsOf(group).map(model=>renderModel(group,model));
 const renderModel=(group,model)=>{
  const key=modelRowId(group,model),checked=isCurrentModel(state.current,{provider:group.id,model:model.id});
  const description=modelDescription(group.id,model,getLocale());
  return h('button',{key,type:'button',role:'menuitemradio','aria-checked':checked,tabIndex:-1,disabled:busy||locked,
   'data-picker-row':key,'data-provider-id':group.id,'data-model-id':model.id,
   ref:node=>{if(node)rowRefs.current.set(key,node);else rowRefs.current.delete(key);},
   className:'lpa-model-option'+(checked?' lpa-model-option--current':''),onFocus:()=>{modelFocus.current=key;},onClick:()=>pick(group,model)},
   h('span',{className:'lpa-model-copy'},h('span',{className:'lpa-model-name'},model.name||model.id),description?h('span',{className:'lpa-model-desc'},description):null),
   checked?h('span',{className:'lpa-model-check','aria-hidden':true},'✓'):null);
 };
 const groupHeader=group=>h('div',{className:'lpa-model-group-name',title:group.id},
  h('span',null,group.id==='deepseek-account'?t('picker.account'):group.name||group.id),
  h('button',{type:'button',className:'lpa-model-pin','data-provider-id':group.id,title:pins.includes(group.id)?t('picker.unpin'):t('picker.pin'),'aria-pressed':pins.includes(group.id),
   'aria-label':pins.includes(group.id)?t('picker.unpin'):t('picker.pin'),onClick:()=>togglePin(group.id)},
   h('span',{'aria-hidden':true},pins.includes(group.id)?t('picker.pinnedMark'):t('picker.pinMark'))));
 // Until a model is chosen, the trigger and reasoning slider still belong to the committed route.
 const showEffort=rows.length&&(!zcode||zcGroup?.id===state.current?.provider);
 const effortFrame=showEffort?h('div',{className:'lpa-effort-frame'},h(EffortSlider,{key:JSON.stringify([state.current?.provider,state.current?.model]),state,entry,disabled:busy||locked,t,submit,sliderRef:slider,
  Visual:zcode?ZcodeEffortVisual:ClaudeEffortVisual,inputClass:zcode?'lpa-zt-input':'lpa-ce-input',
  highspeed:zcode&&isGlmHighspeedModel(entry?.model?.name||entry?.model?.id||'')})):null;
 const zcProviderName=group=>group.id==='deepseek-account'?t('picker.account'):group.name||group.id;
 const zcProviderRow=!zcGroup?null:zcSwitchable?h('button',{key:zcHeaderKey,type:'button',role:'menuitem','aria-haspopup':'true','aria-expanded':!!providerView,
  tabIndex:-1,disabled:busy||locked,'data-picker-row':zcHeaderKey,'data-provider-id':zcGroup.id,
  'aria-label':t('picker.providerSwitch',{count:zcOthers.length}),
  ref:node=>{if(node)rowRefs.current.set(zcHeaderKey,node);else rowRefs.current.delete(zcHeaderKey);},
  className:'lpa-zt-row lpa-zt-provider-row',onFocus:()=>{modelFocus.current=zcHeaderKey;},
  onClick:()=>{focusRequest.current='first';setProviderView(open=>!open);}},
  h('span',{className:'lpa-zt-provider-name'},zcProviderName(zcGroup)),
  h('span',{className:'lpa-zt-provider-count'},t('picker.providerCount',{count:zcOthers.length})),
  h('span',{className:'lpa-zt-provider-chevron','aria-hidden':true},'›')):
  h('div',{key:zcHeaderKey,role:'presentation','data-picker-row':zcHeaderKey,'data-provider-id':zcGroup.id,className:'lpa-zt-row lpa-zt-provider-row'},
   h('span',{className:'lpa-zt-provider-name'},zcProviderName(zcGroup)));
 const zcBackRow=h('button',{key:'zc-back',type:'button',role:'menuitem',tabIndex:-1,disabled:busy||locked,'data-picker-row':'zc-back',
  className:'lpa-zt-row lpa-zt-back-row',
  ref:node=>{if(node)rowRefs.current.set('zc-back',node);else rowRefs.current.delete('zc-back');},
  onFocus:()=>{modelFocus.current='zc-back';},onClick:()=>{focusRequest.current='first';setProviderView(null);}},
  h('span',{className:'lpa-zt-back-chevron','aria-hidden':true},'‹'),h('span',null,t('picker.back')));
 const zcProviders=providerView?zcOthers.map(group=>{const key=providerRowKey(group.id),checked=group.id===state.current?.provider;
   return h('button',{key,type:'button',role:'menuitemradio','aria-checked':checked,tabIndex:-1,disabled:busy||locked,
    'data-picker-row':key,'data-provider-id':group.id,
    ref:node=>{if(node)rowRefs.current.set(key,node);else rowRefs.current.delete(key);},
    className:'lpa-zt-row lpa-zt-provider-option'+(checked?' lpa-zt-provider-option--current':''),
    onFocus:()=>{modelFocus.current=key;},onClick:()=>{setViewedProviderId(group.id);focusRequest.current='first';setProviderView(null);}},
    h('span',{className:'lpa-zt-provider-name'},zcProviderName(group)),
    h('span',{className:'lpa-zt-provider-count'},t('picker.providerModels',{count:modelsOf(group).length})),
    checked?h('span',{className:'lpa-model-check','aria-hidden':true},'✓'):null);}):null;
 const zcDivider=h('div',{className:'lpa-zt-divider','aria-hidden':true});
 const zcodeBody=h(React.Fragment,null,
  providerView?null:zcProviderRow,
  providerView?null:zcDivider,
  h('div',{className:'lpa-model-scroll',role:'menu','aria-label':t('picker.models')},
   providerView?h(React.Fragment,null,zcProviders,h('div',{className:'lpa-zt-divider','aria-hidden':true}),zcBackRow):(zcGroup?renderModels(zcGroup):h('p',{className:'lpa-model-status',role:'status'},loadingState(state)?t('picker.loading'):t('picker.empty')))),
  failures.length?h('div',{className:'lpa-model-failures'},failures.map(f=>h('p',{key:f.id,className:'lpa-model-status',role:'status'},t(f.key,f.params)))):null,
  showEffort?zcDivider:null,
  effortFrame,
  error?h('p',{className:'lpa-model-error',role:'alert'},t(error==='session/writer-held'?'picker.sessionInUse':'picker.failed')):null,
  busy&&!silentSubmit?h('span',{className:'lpa-model-status',role:'status'},t('picker.saving')):null);

 const otherRow=()=>{
  const key=providerRowKey(OTHER_MODELS),current=collapsed.some(group=>state.current?.provider===group.id);
  return h('button',{key,type:'button',role:'menuitem','aria-label':t('picker.otherRow',{count:otherCount}),
   tabIndex:-1,disabled:busy||locked,'data-picker-row':key,'data-provider-id':OTHER_MODELS,
   'aria-haspopup':'true','aria-expanded':otherOpen&&collapsed.length>0,
   ref:node=>{otherRowRef.current=node;if(node)rowRefs.current.set(key,node);else rowRefs.current.delete(key);},
   className:'lpa-model-provider-row'+(current?' lpa-model-provider-row--current':'')+(otherOpen&&collapsed.length?' lpa-model-provider-row--open':''),
   onFocus:()=>{modelFocus.current=key;},
   onClick:()=>{if(!busy&&!locked)setOtherOpen(old=>!old);},
   onKeyDown:e=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();setOtherOpen(true);}}},
   h('span',{className:'lpa-model-provider-copy'},h('span',{className:'lpa-model-provider-name'},t('picker.otherModels'))),
   h('span',{className:'lpa-model-provider-meta'},
    current?h('span',{className:'lpa-model-check','aria-hidden':true},'✓'):null,
    h('span',{className:'lpa-model-provider-count'},String(otherCount)),
    h('span',{className:'lpa-model-provider-chevron','aria-hidden':true},'›')));
 };
 /** Hover panel: the same option rows as a pinned group, separated by provider dividers. */
 const flyoutPanel=otherOpen&&collapsed.length?h('div',{ref:flyoutRef,className:'lpa-model-flyout',role:'menu','aria-label':t('picker.otherModels'),
  style:flyout?{left:flyout.left,top:flyout.top,maxHeight:flyout.maxHeight}:{left:0,top:0,visibility:'hidden'},
  },
  h('div',{className:'lpa-model-flyout-head'},h('span',null,t('picker.otherModels')),
   h('span',{className:'lpa-model-provider-count'},String(otherCount))),
  h('div',{className:'lpa-model-flyout-scroll'},collapsed.map((group,index)=>h('div',{key:group.id,className:'lpa-model-other-provider'+(index?' lpa-model-other-provider--divided':'')},
   h('div',{className:'lpa-model-other-label'},
    h('span',null,group.id==='deepseek-account'?t('picker.account'):group.name||group.id),
    h('button',{type:'button',className:'lpa-model-pin','data-provider-id':group.id,title:t('picker.pin'),'aria-pressed':false,
     'aria-label':t('picker.pin'),disabled:busy||locked,onClick:()=>togglePin(group.id)},
     h('span',{'aria-hidden':true},t('picker.pinMark')))),
   modelsOf(group).map(model=>renderModel(group,model)))))) : null;
 const menu=visible?h('div',{ref:panel,id:id+'-panel',className:'lpa-model-menu',role:'dialog','aria-label':t('picker.aria'),'aria-busy':busy||loadingState(state),'data-style':style,'data-silent':silentSubmit?'':undefined,
  style:{...(position??{left:0,top:0,visibility:'hidden'}),...menuSurfaceVars()},onKeyDown},
  zcode?zcodeBody:h(React.Fragment,null,
  h('div',{className:'lpa-model-scroll',role:'menu','aria-label':t('picker.models')},
   [...hero.map(group=>h('section',{key:group.id,className:'lpa-model-group',role:'group','aria-label':group.name||group.id},groupHeader(group),renderModels(group))),
    collapsed.length?h('div',{key:'more',className:'lpa-model-more'},otherRow()):null],
   !hero.length&&!collapsed.length?h('p',{className:'lpa-model-status',role:'status'},loadingState(state)?t('picker.loading'):t('picker.empty')):null),
  failures.length?h('div',{className:'lpa-model-failures'},failures.map(f=>h('p',{key:f.id,className:'lpa-model-status',role:'status'},t(f.key,f.params))),
   h('button',{type:'button',className:'lpa-model-retry',onClick:reload,disabled:busy||loadingState(state)},t('picker.retry'))):null,
  effortFrame,
  error?h('p',{className:'lpa-model-error',role:'alert'},t(error==='session/writer-held'?'picker.sessionInUse':'picker.failed')):null,
  busy&&!silentSubmit?h('span',{className:'lpa-model-status',role:'status'},t('picker.saving')):null)):null;
 return h(React.Fragment,null,h('style',null,pickerCss),
  h('div',{className:'lpa-model-root','data-style':style},h('button',{ref:trigger,type:'button',className:'lpa-model-trigger',disabled:!!locked,
   'aria-haspopup':'dialog','aria-expanded':visible,'aria-controls':visible?id+'-panel':undefined,'aria-busy':busy,
   'aria-label':t('picker.ariaCurrent',{model:caption}),title:[caption,effort].filter(Boolean).join(' · '),
   onClick:()=>visible?hide(true):show(),onKeyDown:e=>{if(visible){onKeyDown(e);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show(e.key==='ArrowUp'?'last':'first');}}},
   h('span',{className:'lpa-model-trigger-icon','aria-hidden':true},'◇'),h('span',{className:'lpa-model-trigger-label'},caption),
   effort?h('span',{className:'lpa-model-trigger-effort'},effort):null,h('svg',{className:'lpa-model-chevron',viewBox:'0 0 16 16',width:12,height:12,fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:'false'},h('path',{d:'M4 6l4 4 4-4'})))),
  menu?createPortal(menu,document.body):null,
 flyoutPanel&&visible&&!zcode?createPortal(flyoutPanel,document.body):null);
}
