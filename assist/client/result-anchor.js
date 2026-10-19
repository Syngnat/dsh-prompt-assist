import React from 'react';
const h=React.createElement;
const useLayoutEffect=typeof window==='undefined'?React.useEffect:React.useLayoutEffect;

// All coordinates are viewport pixels; the returned height is in the anchor's CSS pixels.
export function resultHeight({top,clipTop=0,clipBottom,viewportHeight,scale=1,gap=8}){
 if(![top,clipTop,clipBottom,viewportHeight,scale].every(Number.isFinite)||scale<=0||top<=clipTop||top>clipBottom)return 0;
 const preferred=Math.min(320,Math.max(180,viewportHeight/scale*.38));
 const height=Math.max(0,Math.floor(Math.min(preferred,(top-clipTop)/scale-gap-8)));
 // Leave room for padding/borders and one usable control row, or remain hidden.
 return height>=64?height:0;
}

export function measureResultAnchor(element,view){
 // The slot's native zero-height positioned anchor belongs to the resident composer.
 const anchor=element.offsetParent;
 if(!anchor)return 0;
 const rect=anchor.getBoundingClientRect(),viewport=view.visualViewport;
 const viewportHeight=viewport?.height??view.innerHeight;
 let clipTop=viewport?.offsetTop??0,clipBottom=clipTop+viewportHeight;
 const scale=anchor.offsetWidth>0?rect.width/anchor.offsetWidth:1;
 // Intersect the containing scrollports, not other plugins' cards or CSS selectors.
 for(let parent=anchor.parentElement;parent;parent=parent.parentElement){
  const style=view.getComputedStyle(parent);
  if(style.display==='contents'||!/(auto|scroll|hidden|clip)/.test(style.overflowY))continue;
  const bounds=parent.getBoundingClientRect();
  const factor=parent.offsetHeight>0?bounds.height/parent.offsetHeight:1;
  const edge=bounds.top+(parent.clientTop??0)*factor;
  clipTop=Math.max(clipTop,edge);clipBottom=Math.min(clipBottom,edge+parent.clientHeight*factor);
 }
 return resultHeight({top:rect.top,clipTop,clipBottom,viewportHeight,scale});
}

export function observeResultAnchor(element,view,update){
 let frame=null,disposed=false;
 const measure=()=>{frame=null;if(!disposed)update(measureResultAnchor(element,view));};
 const schedule=()=>{if(!disposed&&frame===null)frame=view.requestAnimationFrame(measure);};
 const observer=view.ResizeObserver?new view.ResizeObserver(schedule):null;
 for(let parent=element.parentElement;parent;parent=parent.parentElement)observer?.observe(parent);
 view.addEventListener('resize',schedule);
 view.addEventListener('scroll',schedule,true);
 view.visualViewport?.addEventListener('resize',schedule);
 view.visualViewport?.addEventListener('scroll',schedule);
 measure();
 return ()=>{
  disposed=true;observer?.disconnect();if(frame!==null)view.cancelAnimationFrame(frame);
  view.removeEventListener('resize',schedule);view.removeEventListener('scroll',schedule,true);
  view.visualViewport?.removeEventListener('resize',schedule);view.visualViewport?.removeEventListener('scroll',schedule);
 };
}

export function ResultAnchor({children}){
 const ref=React.useRef(null),[height,setHeight]=React.useState(320);
 useLayoutEffect(()=>{
  const element=ref.current,view=element?.ownerDocument?.defaultView;
  if(element&&view)return observeResultAnchor(element,view,setHeight);
 },[]);
 // Text growth, draft edits and same-session phase changes may move the resident card.
 useLayoutEffect(()=>{
  const element=ref.current,view=element?.ownerDocument?.defaultView;
  if(element&&view)setHeight(measureResultAnchor(element,view));
 });
 return h('div',{ref,className:'lpa-result-anchor',style:{'--lpa-result-height':`${height}px`,visibility:height>0?'inherit':'hidden'}},children);
}
