/*!
 * Model descriptions and lookup adapted from dsh-claude-style 0.16.3.
 * Source commit: 33fc20b63d4cbd31cfec98d7952e3c53ec11c832
 * Provenance: third-party/claude-style/PROVENANCE.json
 *
 * MIT License
 *
 * Copyright (c) 2026 Nwflower
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import data from './model-descriptions-data.json' with {type: 'json'};

export const MODEL_DESCRIPTION_PROVENANCE = Object.freeze({
  package: 'dsh-claude-style',
  version: '0.16.3',
  commit: '33fc20b63d4cbd31cfec98d7952e3c53ec11c832',
  sourceUrl: 'https://raw.githubusercontent.com/Nwflower/dsh-claude-style/33fc20b63d4cbd31cfec98d7952e3c53ec11c832/packages/client/data/model-descriptions.json',
  license: 'MIT',
});

const compile = rules => rules.map(rule => ({re: new RegExp(rule.match, 'i'), text: rule.text}));
const families = compile(data.families);
const tiers = compile(data.tiers);
const fallbackLocale = data.fallback || 'en';

function familyCopy(provider, id) {
  // Preserve namespaces and try the model ID before adding its serving provider.
  for (const candidate of [id, `${String(provider ?? '').toLowerCase()}/${id}`]) {
    for (const rule of families) if (rule.re.test(candidate)) return rule.text;
  }
  return null;
}

function localized(pair, locale) {
  if (!pair) return '';
  const language = typeof locale === 'string' && locale ? locale : 'en';
  const prefix = language.includes('-') ? language.split('-')[0]
    : language.includes('_') ? language.split('_')[0] : '';
  const fallbackPrefix = fallbackLocale.includes('-') ? fallbackLocale.split('-')[0] : '';
  for (const key of [language, prefix, fallbackLocale, fallbackPrefix]) {
    if (key && typeof pair[key] === 'string' && pair[key]) return pair[key];
  }
  return '';
}

/**
 * Builtin display text for an SDK model {id, name, description?}.
 * Family rules precede tiers, then the model's own description. Returns plain text.
 * @param {string} provider
 * @param {{id: string, name: string, description?: string} | null | undefined} model
 * @param {string} locale
 * @returns {string}
 */
export function modelDescription(provider, model, locale = 'zh') {
  const metadata = typeof model?.description === 'string' ? model.description : '';
  const id = typeof model?.id === 'string' ? model.id.toLowerCase() : '';
  if (!id) return metadata;
  const pair = familyCopy(provider, id) || tiers.find(rule => rule.re.test(id))?.text;
  return localized(pair, locale) || metadata;
}
