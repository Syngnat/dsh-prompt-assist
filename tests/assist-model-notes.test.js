import test from 'node:test';
import assert from 'node:assert/strict';
import {noteKey, normalizeNoteText, noteFor, normalizeNotes, NOTE_MAX} from '../assist/client/model-notes.js';

test('a description key needs both a provider and a model', () => {
  assert.equal(noteKey('openai', 'gpt-5'), '["openai","gpt-5"]');
  assert.equal(noteKey('', 'gpt-5'), '');
  assert.equal(noteKey('openai', ''), '');
  assert.equal(noteKey(undefined, 'gpt-5'), '');
});

test('a namespaced model id stays unambiguous inside the key', () => {
  const key = noteKey('安和桥', 'grok-4.7');
  assert.equal(JSON.parse(key).length, 2);
  assert.notEqual(noteKey('a', 'b/c'), noteKey('a/b', 'c'));
  assert.notEqual(noteKey('openai', 'gpt-5'), noteKey('openai/gpt', '5'));
});

test('descriptions collapse whitespace and trim without silent truncation', () => {
  assert.equal(normalizeNoteText('  fast   and\tcheap  '), 'fast and cheap');
  assert.equal(normalizeNoteText('line\nbreak'), 'line break');
  assert.equal(normalizeNoteText(undefined), '');
  assert.equal(normalizeNoteText('   '), '');
  // Over-length text is the Host's rejection to make, never a silent cut.
  assert.equal(normalizeNoteText('x'.repeat(NOTE_MAX + 40)).length, NOTE_MAX + 40);
});

test('lookup only reads an exact provider/model key', () => {
  const notes = {'["openai","gpt-5"]': 'strong reasoning', '["xai","grok-4"]': ''};
  assert.equal(noteFor(notes, 'openai', 'gpt-5'), 'strong reasoning');
  assert.equal(noteFor(notes, 'openai', 'gpt-4'), '');
  assert.equal(noteFor(notes, 'xai', 'grok-4'), '');
  assert.equal(noteFor(null, 'openai', 'gpt-5'), '');
});

test('a snapshot without notes is unavailable, never a silent empty map', () => {
  const legacy = normalizeNotes({});
  assert.equal(legacy.notesAvailable, false);
  assert.deepEqual(legacy.notes, {});
});

test('a malformed snapshot fails closed instead of rendering wrong descriptions', () => {
  for (const patch of [
    {notes: {'not-json': 'x'}, notesRevision: 1, notesAvailable: true},
    {notes: {'["openai","gpt-5"]': 5}, notesRevision: 1, notesAvailable: true},
    {notes: {'["openai","gpt-5"]': 'x'.repeat(NOTE_MAX + 1)}, notesRevision: 1, notesAvailable: true},
    {notes: {}, notesRevision: -1, notesAvailable: true},
    {notes: {}, notesRevision: 1},
  ]) assert.throws(() => normalizeNotes(patch));
});

test('a valid snapshot is frozen and keeps the Host revision', () => {
  const value = normalizeNotes({notes: {'["openai","gpt-5"]': 'strong'}, notesRevision: 4, notesAvailable: true});
  assert.equal(value.notesRevision, 4);
  assert.equal(value.notesAvailable, true);
  assert.ok(Object.isFrozen(value.notes));
});
