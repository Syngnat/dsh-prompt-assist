import test from 'node:test';
import assert from 'node:assert/strict';
import {resultHeight,measureResultAnchor,observeResultAnchor} from '../assist/client/result-anchor.js';
import {css} from '../assist/client/style.js';

const base={top:600,clipTop:76,clipBottom:720,viewportHeight:720};
test('result height fits the visible area above its own composer',()=>{
 assert.equal(resultHeight(base),273);
 assert.equal(resultHeight({...base,top:200}),108);
 assert.equal(resultHeight({...base,top:90}),0);
 assert.equal(resultHeight({...base,top:100,clipTop:78}),0);
});
test('hidden or offscreen composer does not leave a detached result',()=>{
 for(const top of [0,-10,721,Infinity])assert.equal(resultHeight({...base,top}),0);
 assert.equal(resultHeight({...base,scale:0}),0);
});
test('zoom and short visual viewports constrain CSS height rather than viewport coordinates',()=>{
 assert.equal(resultHeight({...base,top:300,scale:1.25}),163);
 assert.equal(resultHeight({...base,top:240,clipTop:100,clipBottom:360,viewportHeight:260}),124);
});
function dom(){
 const clip={parentElement:null,offsetHeight:644,clientHeight:640,clientTop:2,getBoundingClientRect:()=>({top:76,height:644}),style:{display:'flex',overflowY:'auto'}};
 const card={parentElement:clip,style:{display:'flex',overflowY:'visible'}};
 const anchor={parentElement:card,offsetWidth:800,getBoundingClientRect:()=>({top:300,width:800})};
 const element={offsetParent:anchor,parentElement:anchor};
 const view={innerHeight:720,getComputedStyle:node=>node.style??{display:'contents',overflowY:'visible'}};
 return {element,view,anchor,clip};
}
test('measurement intersects actual ancestor scrollports and their border clearance',()=>{
 const {element,view}=dom();assert.equal(measureResultAnchor(element,view),206);
 element.offsetParent=null;assert.equal(measureResultAnchor(element,view),0);
});
test('zero-box slot outlets are not mistaken for clipping containers',()=>{
 const {element,view,anchor}=dom();anchor.parentElement={parentElement:anchor.parentElement,style:{display:'contents',overflowY:'hidden'}};
 assert.equal(measureResultAnchor(element,view),206);
});
test('visual keyboard viewport and clipping bottom suppress offscreen results',()=>{
 const {element,view}=dom();view.visualViewport={offsetTop:150,height:140};assert.equal(measureResultAnchor(element,view),0);
 view.visualViewport={offsetTop:150,height:200};assert.equal(measureResultAnchor(element,view),134);
});
test('observation is coalesced and all listeners, observers and queued work are disposed',()=>{
 const {element,view}=dom(),listeners=new Map(),vListeners=new Map(),observed=[];let callback,cancelled=0,disconnected=0,resize;
 view.requestAnimationFrame=fn=>{callback=fn;return 1;};view.cancelAnimationFrame=()=>{callback=null;cancelled++;};
 view.addEventListener=(key,fn)=>listeners.set(key,fn);view.removeEventListener=key=>listeners.delete(key);
 view.visualViewport={offsetTop:0,height:720,addEventListener:(key,fn)=>vListeners.set(key,fn),removeEventListener:key=>vListeners.delete(key)};
 view.ResizeObserver=class{constructor(fn){resize=fn;}observe(node){observed.push(node);}disconnect(){disconnected++;}};
 const heights=[],dispose=observeResultAnchor(element,view,value=>heights.push(value));
 assert.deepEqual(heights,[206]);assert.equal(observed.length,3);
 resize();listeners.get('scroll')();callback();assert.deepEqual(heights,[206,206]);
 resize();dispose();assert.equal(cancelled,1);assert.equal(disconnected,1);assert.equal(listeners.size,0);assert.equal(vListeners.size,0);
 resize();assert.equal(callback,null);
});
test('only the result owns a local anchor; native menus stay above it',()=>{
 assert.match(css,/\.lpa-result-anchor\{position:absolute;inset-inline:0;bottom:8px;z-index:90/);
 assert.match(css,/var\(--lpa-result-height,320px\)/);
 assert.deepEqual([...css.matchAll(/([^{}]+)\{[^}]*position:fixed/g)].map(m=>m[1].trim()),['.lpa-model-menu']);
 assert.doesNotMatch(css,/data-dsh-claude|data-composer-card/);
});
