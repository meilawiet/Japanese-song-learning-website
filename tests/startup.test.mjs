import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { demoSongs } from '../src/data/demoSongs.js'

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts

test('Windows launch does not use Uvicorn auto-reload', () => {
  assert.match(scripts.api, /uvicorn app:app --app-dir server/)
  assert.doesNotMatch(scripts.api, /--reload/)
  assert.match(scripts.dev, /npm run api/)
  assert.match(scripts.dev, /npm run web/)
})

test('an empty folder import still has an original practice song', () => {
  assert.ok(demoSongs.some((song) => song.lines?.length > 0))
})
