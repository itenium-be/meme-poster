import { test, expect } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { postId, hasSent, markSent } from './sent-store'

test('postId: extracts id from redd.it postLink', () => {
  expect(postId('https://redd.it/1un1qe3')).toBe('1un1qe3')
})

test('postId: ignores a trailing slash', () => {
  expect(postId('https://redd.it/1un1qe3/')).toBe('1un1qe3')
})

test('hasSent/markSent: round-trip in a fresh dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humor-sent-'))
  expect(hasSent(dir, 'abc')).toBe(false)
  markSent(dir, 'abc')
  expect(hasSent(dir, 'abc')).toBe(true)
})

test('markSent: creates the dir if it does not exist', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'humor-')), 'nested')
  markSent(dir, 'x')
  expect(hasSent(dir, 'x')).toBe(true)
})
