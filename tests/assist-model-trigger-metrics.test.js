import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerCss} from '../assist/client/model-picker-style.js';

// The trigger label combines nowrap + overflow:hidden with text-overflow:ellipsis, so its box
// height is exactly the line box: a line-height below the font's ascent+descent shaves the
// descenders (the "p" in DeepSeek) and the bottom strokes of CJK labels. Both halves must keep a
// line box tall enough for a 13px font (~17px of ink) while the 28px button still centres them.
const ruleBody=(selector)=>{
  const start=pickerCss.indexOf(`${selector}{`);
  assert.ok(start>=0,`missing rule ${selector}`);
  const end=pickerCss.indexOf('}',start);
  assert.ok(end>start,`unterminated rule ${selector}`);
  return pickerCss.slice(start+selector.length+1,end);
};

const declaration=(body,property)=>{
  const match=body.match(new RegExp(`(?:^|;)${property}:([^;]+)`));
  return match===null?null:match[1].trim();
};

const pxLength=(body,property)=>{
  const raw=declaration(body,property);
  assert.ok(raw!==null,`missing ${property}`);
  const match=raw.match(/^(-?\d+(?:\.\d+)?)px$/);
  assert.ok(match!==null,`${property} must be an explicit px length, got "${raw}"`);
  return Number(match[1]);
};

test('model trigger never clips glyph descenders or CJK bottoms',()=>{
  const trigger=ruleBody('.lpa-model-trigger');
  const label=ruleBody('.lpa-model-trigger-label');
  const effort=ruleBody('.lpa-model-trigger-effort');
  const fontSize=pxLength(trigger,'font-size');
  const buttonHeight=pxLength(trigger,'height');
  // 1.3em covers the ascent+descent of the host UI stack with headroom; 13px * 1.3 === 17px.
  const minimumLineBox=Math.ceil(fontSize*1.3);

  for(const [name,body] of [['label',label],['effort',effort]]){
    const lineHeight=pxLength(body,'line-height');
    assert.ok(lineHeight>=minimumLineBox,`${name} line box ${lineHeight}px cannot hold ${fontSize}px ink (needs >=${minimumLineBox}px)`);
    assert.ok(lineHeight<=buttonHeight,`${name} line box ${lineHeight}px overflows the ${buttonHeight}px trigger`);
  }

  // Horizontal truncation has to keep working: nowrap + hidden overflow + ellipsis.
  assert.equal(declaration(label,'white-space'),'nowrap');
  assert.equal(declaration(label,'overflow'),'hidden');
  assert.equal(declaration(label,'text-overflow'),'ellipsis');
  assert.equal(declaration(label,'display'),'block');
});
