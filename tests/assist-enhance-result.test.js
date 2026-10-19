import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnchangedEnhancement} from '../assist/client/enhance-result.js';

for (const [name, original, text] of [
  ['exact multiline echo', 'First requirement.\n\nSecond requirement.', 'First requirement.\n\nSecond requirement.'],
  ['outer whitespace only', '  Review this.\n', '\tReview this.  \r\n'],
  ['CRLF versus LF only', 'First\r\n\r\nSecond', 'First\n\nSecond'],
  ['combined CRLF and outer whitespace', '\nFirst\r\nSecond  ', '  First\nSecond\r\n'],
  ['unchanged code and model IDs', '```js\nconst model = "grok-4-1-fast-reasoning";\n```', '```js\nconst model = "grok-4-1-fast-reasoning";\n```'],
  ['unchanged Windows path', 'Read D:\\repo\\client.js.', 'Read D:\\repo\\client.js.'],
]) {
  test(`exact echo detection accepts ${name}`, () => {
    assert.equal(isUnchangedEnhancement(original, text), true);
  });
}

for (const [name, original, text] of [
  ['added punctuation', 'Review this', 'Review this.'],
  ['changed punctuation', 'Review this.', 'Review this!'],
  ['a slight paraphrase', 'Review code and report risks.', 'Inspect code and report risks.'],
  ['case change', 'Review code.', 'review code.'],
  ['new requirement lines', 'Review code. Report risks.', 'Review code.\nReport risks.'],
  ['new paragraph', 'Review code.\nReport risks.', 'Review code.\n\nReport risks.'],
  ['added numbered structure', 'Review code. Report risks.', '1. Review code.\n2. Report risks.'],
  ['added bullet structure', 'Review code. Report risks.', '- Review code.\n- Report risks.'],
  ['code fences', 'const value = 1;', '```js\nconst value = 1;\n```'],
  ['code indentation', 'if (ready) {\n  run();\n}', 'if (ready) {\n    run();\n}'],
  ['internal spaces', 'Review code.', 'Review  code.'],
  ['internal tabs', 'Review code.', 'Review\tcode.'],
  ['lone carriage return', 'First\rSecond', 'First\nSecond'],
  ['literal escaped newline', 'First\\nSecond', 'First\nSecond'],
  ['model ID', 'Use grok-4-1-fast-reasoning.', 'Use grok-4-1-fast-non-reasoning.'],
  ['path separators', 'Read D:\\repo\\client.js.', 'Read D:/repo/client.js.'],
  ['internal nonbreaking space', 'Review code.', 'Review\u00a0code.'],
]) {
  test(`exact echo detection preserves ${name} as a change`, () => {
    assert.equal(isUnchangedEnhancement(original, text), false);
  });
}

test('invalid text is not classified as an exact echo', () => {
  for (const invalid of [undefined, null, 1, {}, ['Review this.']]) {
    assert.equal(isUnchangedEnhancement(invalid, 'Review this.'), false);
    assert.equal(isUnchangedEnhancement('Review this.', invalid), false);
  }
});
