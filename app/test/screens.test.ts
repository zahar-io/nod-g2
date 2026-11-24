import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fit, homeRow, view, DIGEST, SPEAK, BACK } from '../src/screens.ts'
import type { FeedItem } from '../src/screens.ts'

const a: FeedItem = { key: 'a:1:2', kind: 'approval', chatId: '1', msgId: 2, title: 'Ops agent', from: 'Ops agent', gist: 'Renew seat, £12/month', text: 'long', unread: 1, buttons: [{ label: 'Approve', data: 'x' }, { label: 'Deny', data: 'y' }] }
const c: FeedItem = { key: 'c:3', kind: 'chat', chatId: '3', msgId: 5, title: 'Anna (client)', from: 'Anna', gist: 'Move call to 3pm?', text: 'x', unread: 2 }

test('list rows fit the 63-byte firmware cap, multibyte included', () => {
  const s = fit('Привіт, ' + 'дуже довге повідомлення '.repeat(5))
  assert.ok(new TextEncoder().encode(s).length <= 63)
  assert.ok(s.endsWith('...'))
  assert.equal(fit('short'), 'short')
})

test('home: approvals marked, counts in header, digest and refresh last', () => {
  const v = view({ name: 'home', items: [a, c] })
  assert.equal(v.text, 'NOD  1 to approve · 1 to answer')
  assert.deepEqual(v.list, ['! Ops agent: Renew seat, £12/month', 'Anna (2): Move call to 3pm?', DIGEST, 'Refresh'])
  assert.equal(homeRow(c), 'Anna (2): Move call to 3pm?')
})

test('home empty state says all clear', () => {
  assert.match(view({ name: 'home', items: [] }).text, /All clear/)
})

test('approval lists every button then Back', () => {
  assert.deepEqual(view({ name: 'approval', item: a }).list, ['Approve', 'Deny', BACK])
})

test('chat shows drafts, speak and back; total rows stay small', () => {
  const v = view({ name: 'chat', item: c, lines: ['Anna: hi'], drafts: ['Yes', 'No', 'Later'] })
  assert.deepEqual(v.list, ['Yes', 'No', 'Later', SPEAK, BACK])
})

test('every view fits the 576x288 canvas', () => {
  for (const s of [
    view({ name: 'home', items: [a, c] }),
    view({ name: 'approval', item: a }),
    view({ name: 'confirm', item: c, text: 'x'.repeat(500) }),
    view({ name: 'digest', lines: ['a', 'b'] }),
  ]) {
    assert.ok(s.textHeight <= 288)
    assert.ok(s.text.length < 1000)
  }
})
