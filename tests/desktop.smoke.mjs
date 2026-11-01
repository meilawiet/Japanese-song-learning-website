import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { inspectLearningBackup } from '../src/lib/learningBackup.js'
import { runDataProtectionChecks } from './dataProtection.desktop.mjs'
import { assertRomanAlignment } from './readingAlignment.desktop.mjs'
import { runRangePracticeChecks } from './rangePractice.desktop.mjs'

const root = process.cwd()
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(root, 'work', '便携 验证')
assert.equal(path.dirname(testDir), path.join(root, 'work'))
await fs.rm(testDir, { recursive: true, force: true })
await fs.mkdir(testDir, { recursive: true })
await fs.cp(source, testDir, { recursive: true, filter: (item) => path.basename(item) !== 'uta-data' })
const environment = { ...process.env, PATH: path.join(process.env.SystemRoot, 'System32'),
  TEMP: path.join(testDir, 'uta-data', 'tmp'), TMP: path.join(testDir, 'uta-data', 'tmp') }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.PYTHONHOME
delete environment.PYTHONPATH
await fs.mkdir(environment.TEMP, { recursive: true })
const evidence = path.join(root, 'work', 'verification')
await fs.mkdir(evidence, { recursive: true })
let client
let dataProtectionChecks = []
let rangePracticeChecks = []
const failures = []
const mock = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const isSegmentationReview = Buffer.concat(chunks).toString('utf8').includes('segmentation_suggestions')
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const userInput = body.messages.filter(message => message.role === 'user').at(-1).content
  const firstLineId = isSegmentationReview ? JSON.parse(userInput.slice(userInput.lastIndexOf('\n{') + 1)).lines[0].id : null
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ choices: [{ message: { content: isSegmentationReview
    ? JSON.stringify({ suggestions: [], segmentation_suggestions: [{ line_id: firstLineId, start_token_index: 0,
      end_token_index: 0, suggested_segments: ['学', '校'], confidence: 0.9, reason: '测试分词建议' }] })
    : '{"ok":true}' } }] }))
})
mock.listen(0, '127.0.0.1'); await once(mock, 'listening')
const mockOrigin = `http://127.0.0.1:${mock.address().port}/v1`
// Native accelerators require Electron input, not Chromium DevTools key injection.
async function shortcut(key, shift = false) {
  await client.evaluate(({ BrowserWindow }, input) => {
    const window = BrowserWindow.getAllWindows()[0]; window.focus();
    const modifiers = ['control', ...(input.shift ? ['shift'] : [])];
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: input.key, modifiers });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: input.key, modifiers });
  }, { key, shift });
}
async function launch() {
  client = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), args: [], env: environment, timeout: 90000 })
  const page = await client.firstWindow({ timeout: 90000 })
  page.on('pageerror', (error) => failures.push(error.message))
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  return page
}
try {
  let page = await launch()
  assert.equal(page.url(), 'uta://app/')
  const runtime = await client.evaluate(({ app }) => ({ data: app.getPath('userData'), packaged: app.isPackaged, version: app.getVersion() }))
  assert.equal(runtime.packaged, true)
  assert.equal(runtime.data, path.join(testDir, 'uta-data', 'profile'))
  await page.waitForSelector('.lyrics-list .token-reading-kana', { timeout:30000 })
  await page.screenshot({ path:path.join(evidence, 'desktop-home.png') })
  const health = await page.evaluate(() => fetch('/api/health').then((response) => response.json()))
  assert.equal(health.status, 'ok'); assert.equal(health.tomoshi_dictionary, true)
  const annotated = await page.evaluate(() => fetch('/api/annotate/batch', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ id: 0, text: '学校へ帰る。' }] }) }).then((response) => response.json()))
  assert.ok(annotated[0].tokens.some((word) => word.surface === '帰る' && word.reading === 'かえる'))
  assert.ok(annotated[0].tokens.some((word) => word.surface === '学校' && word.meaning))
  const ai = await page.evaluate(async (origin) => {
    const config = { name: 'Smoke test', protocol: 'openai-compatible', base_url: origin, model: 'test', api_key: 'mock-only', json_mode: true }
    const response = await fetch('/api/ai/test', { method: 'POST', headers: { 'X-UTA-AI-Config': encodeURIComponent(JSON.stringify(config)) }, body: '{}' })
    return { status: response.status, body: await response.json() }
  }, mockOrigin)
  assert.equal(ai.status, 200); assert.equal(ai.body.ok, true)
  const reviewed = await page.evaluate(async ({ origin, tokens }) => {
    const config = { name:'Smoke test', protocol:'openai-compatible', base_url:origin, model:'test', api_key:'mock-only', json_mode:true }
    const response = await fetch('/api/ai/review-song', { method:'POST', headers:{'Content-Type':'application/json', 'X-UTA-AI-Config':encodeURIComponent(JSON.stringify(config))},
      body:JSON.stringify({song_id:'local-smoke',title:'测试歌曲',artist:'UTA',lines:[{id:0,text:'学校へ帰る。',tokens:tokens.map(token=>({index:token.index,surface:token.surface,reading:token.reading,is_symbol:token.is_symbol}))}]}) })
    return {status:response.status, body:await response.json()}
  }, {origin:mockOrigin,tokens:annotated[0].tokens})
  assert.equal(reviewed.status,200)
  assert.deepEqual(reviewed.body.segmentation_suggestions[0].original_segments,['学校'])
  assert.deepEqual(reviewed.body.segmentation_suggestions[0].suggested_segments,['学','校'])

  assert.equal(await page.locator('.desktop-titlebar').count(), 1)
  assert.equal(await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false)
  await page.getByRole('button', { name: '复习', exact: true }).click()
  await page.getByRole('heading', { name: '待复习的句子', exact: true }).waitFor()
  await page.screenshot({ path: path.join(evidence, 'desktop-review.png') })
  await shortcut('2')
  await page.locator('.desktop-song-table').waitFor()
  await page.getByRole('button', { name: '我的收藏', exact: true }).click()
  await page.getByRole('button', { name: '全部歌曲', exact: true }).click()
  await page.getByLabel('歌曲排序').selectOption('title')
  await shortcut('F')
  await page.waitForFunction(() => document.activeElement?.id === 'library-search')
  await page.getByLabel('搜索歌名或歌手').fill('不存在的测试歌曲')
  await page.getByRole('heading', { name: '没有匹配的歌曲' }).waitFor()
  await page.getByLabel('搜索歌名或歌手').fill('')
  await page.screenshot({ path: path.join(evidence, 'desktop-library.png') })

  // Import through the actual UI; the original test audio is a short silent WAV.
  const samples = 8000 * 6, wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
  const lyrics = '[ti:Windows便携测试]\n[ar:UTA原创]\n[00:00.50]学校へ帰る。\n[00:00.50]放学回家。\n[00:01.00]夢を見よう。\n[00:01.00]一起做梦。\n[00:02.00]雨が降る。\n[00:02.00]雨在下。\n[00:04.00]風を感じよう。\n[00:04.00]感受风。\n'
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await shortcut('O')
  const form = page.locator('.song-import-dialog')
  await form.locator('input[type=file][accept*="audio"]').setInputFiles({ name: 'UTA-original.wav', mimeType: 'audio/wav', buffer: wav })
  await form.locator('input[type=file][accept*=".lrc"]').setInputFiles({ name: 'Windows-test.lrc', mimeType: 'text/plain', buffer: Buffer.from(lyrics) })
  await form.locator('.song-import-submit').click({ timeout: 45000 })
  await page.waitForSelector('.song-import-dialog', { state: 'detached', timeout: 45000 })
  await page.waitForFunction(() => document.body.innerText.includes('Windows便携测试'))
  await page.waitForSelector('.lyrics-list .token-reading-kana', { timeout: 30000 })
  await page.screenshot({ path: path.join(evidence, 'windows-app.png'), fullPage: false })
  assert.equal(await page.locator('.desktop-shell-lesson .desktop-player').count(), 0)
  assert.equal(await page.locator('.lyrics-list .line-play').count(), 0)
  const lessonDisplay = page.getByLabel('学习页读音显示方式')
  assert.deepEqual(await lessonDisplay.locator('option').allTextContents(), ['假名＋罗马音', '仅假名', '仅罗马音', '仅歌词'])
  await lessonDisplay.selectOption('romaji')
  assert.equal(await page.locator('.lyrics-list .auto-lyric.romaji').count() > 0, true)
  await lessonDisplay.selectOption('lyrics')
  assert.equal(await page.locator('.lyrics-list ruby rt').count(), 0)
  await lessonDisplay.selectOption('both')
  await page.locator('.lyrics-list .word-aligned').first().waitFor()
  await lessonDisplay.selectOption('kana')
  await page.getByLabel('逐句播放速度').selectOption('0.5')
  await page.locator('.lyrics-list .lyric-row').first().locator('.line-number').dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 0.5)
  await page.locator('.lyrics-list .lyric-row').first().locator('.line-number').dblclick()
  await page.waitForFunction(() => document.querySelector('audio').paused)
  // Record real play calls so exact starts are verified without wall-clock drift.
  await page.evaluate(()=>{
    window.__clipStarts=[];window.__originalPlay=HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play=function(...args){window.__clipStarts.push({time:this.currentTime,rate:this.playbackRate});return window.__originalPlay.apply(this,args)}
  })
  const lyricRows=page.locator('.lyrics-list .lyric-row')
  const selection=page.getByRole('region',{name:'选中歌词片段',exact:true})
  await lyricRows.nth(1).locator('.line-number').click()
  await lyricRows.nth(2).locator('.lyric-token').first().click({modifiers:['Control']})
  assert.equal(await page.locator('.desktop-range-selected').count(),2)
  assert.equal(await selection.getAttribute('data-start'),'1')
  assert.equal(await selection.getAttribute('data-end'),'4')
  await lyricRows.nth(3).locator('.translation').click({modifiers:['Control']})
  assert.equal(await page.locator('.desktop-range-selected').count(),3)
  assert.equal(await selection.getAttribute('data-end'),'6')
  await lyricRows.nth(0).locator('.line-number').click({modifiers:['Control']})
  assert.equal(await page.locator('.desktop-range-selected').count(),2)
  assert.equal(await selection.getAttribute('data-start'),'0.5')
  assert.equal(await selection.getAttribute('data-end'),'2')
  await lyricRows.nth(1).locator('.line-number').click()
  await lyricRows.nth(2).locator('.lyric-token').first().click({modifiers:['Control']})
  await page.getByLabel('选段播放速度',{exact:true}).selectOption('0.5')
  await page.getByRole('button',{name:'播放选中片段',exact:true}).click()
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.__clipStarts.at(-1)),{time:1,rate:0.5})
  assert.equal(await page.getByLabel('逐句播放速度').inputValue(),'0.5')
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).click()
  assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true)
  const pausedTime=await page.locator('audio').evaluate(audio=>audio.currentTime)
  await page.getByRole('button',{name:'继续选中片段',exact:true}).click()
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).waitFor()
  assert.ok(Math.abs((await page.evaluate(()=>window.__clipStarts.at(-1).time))-pausedTime)<0.002)
  await page.getByLabel('选段播放速度',{exact:true}).selectOption('0.25')
  assert.equal(await page.locator('audio').evaluate(audio=>audio.playbackRate),0.25)
  await page.locator('audio').evaluate(audio=>{audio.currentTime=3.99;audio.dispatchEvent(new Event('timeupdate'))})
  await page.waitForFunction(()=>{const audio=document.querySelector('audio');return audio.paused && Math.abs(audio.currentTime-4)<0.002},{},{timeout:3000})
  await page.getByRole('button',{name:'重播选中片段',exact:true}).click()
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.__clipStarts.at(-1).time),1)
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).click()
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960))
  await page.screenshot({path:path.join(evidence,'lyric-range-playback.png')})
  await page.getByRole('button',{name:'取消歌词多选',exact:true}).click()
  assert.equal(await page.locator('.desktop-range-selected').count(),0)
  assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true)
  await lyricRows.nth(2).locator('.line-number').click()
  await lyricRows.nth(3).locator('.lyric-token').first().click({modifiers:['Control']})
  assert.equal(await selection.getAttribute('data-start'),'2')
  assert.equal(await selection.getAttribute('data-end'),'6')
  await page.getByRole('button',{name:'播放选中片段',exact:true}).click()
  await page.getByRole('button',{name:'暂停选中片段',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.__clipStarts.at(-1).time),2)
  await page.locator('audio').evaluate(audio=>{audio.currentTime=5.98;audio.dispatchEvent(new Event('timeupdate'))})
  await page.waitForFunction(()=>{const audio=document.querySelector('audio');return audio.paused && Math.abs(audio.currentTime-6)<0.002},{},{timeout:3000})
  // A normal word click cancels range selection; original line playback still starts 0.5s early.
  await lyricRows.first().locator('.lyric-token').first().click()
  assert.equal(await page.locator('.desktop-range-selected').count(),0)
  await lyricRows.first().locator('.line-number').dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  assert.equal(await page.evaluate(()=>window.__clipStarts.at(-1).time),0)
  await lyricRows.first().locator('.line-number').dblclick()
  await page.waitForFunction(() => document.querySelector('audio').paused)
  await page.getByLabel('逐句播放速度').selectOption('0.5')
  await page.evaluate(()=>{HTMLMediaElement.prototype.play=window.__originalPlay;delete window.__originalPlay})
  rangePracticeChecks = await runRangePracticeChecks({ page, client, evidence, audioFixture: wav })
  // Right-click editing stays on the current song and persists a per-word ruby choice.
  await lyricRows.first().locator('.line-number').click({ button:'right' })
  await page.getByRole('menuitem', { name: /编辑歌词/ }).click()
  const inlineEditor = page.locator('.line-editor')
  await inlineEditor.waitFor()
  await inlineEditor.getByLabel('中文译文').fill('放学回家。')
  await inlineEditor.getByLabel('隐藏此词注音').first().check()
  await inlineEditor.getByRole('button',{name:'自定义分词'}).click()
  const segmentation = page.locator('.segmentation-dialog')
  await segmentation.getByRole('button',{name:'学和校之间拆分'}).click()
  await segmentation.getByRole('button',{name:'确认分词'}).click()
  await segmentation.waitFor({state:'detached'})
  await inlineEditor.getByLabel('学的读音').fill('がく')
  await inlineEditor.getByLabel('校的读音').fill('こう')
  assert.equal(await inlineEditor.locator('.line-editor-word').filter({has:page.getByLabel('学的读音')}).locator('.line-editor-romaji').textContent(),'gaku')
  assert.equal(await inlineEditor.locator('.line-editor-word').filter({has:page.getByLabel('校的读音')}).locator('.line-editor-romaji').textContent(),'kou')
  await page.screenshot({path:path.join(evidence,'word-segmentation.png')})
  await inlineEditor.getByRole('button',{name:'保存修改'}).click()
  await inlineEditor.waitFor({state:'detached'})
  await page.getByRole('button',{name:'撤销本次歌曲编辑',exact:true}).waitFor()
  await page.waitForFunction(()=>document.querySelector('.lyrics-list .lyric-row .translation')?.textContent === '放学回家。')
  assert.equal(await lyricRows.first().locator('.lyric-token').first().locator('rt').count(),0)
  assert.deepEqual(await lyricRows.first().locator('.token-reading-surface').allTextContents().then(items=>items.slice(0,2)),['学','校'])
  assert.ok(Object.values(await page.evaluate(()=>JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).hiddenReadings)).includes(true))
  // Word details now open only after an explicit word selection.
  await lyricRows.first().locator('.lyric-token').first().click()
  for (const [width,height] of [[1024,768], [1440,960]]) {
    await client.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width,height])
    await page.waitForTimeout(250)
    const bounds = await page.evaluate(() => ({ width:innerWidth, height:innerHeight, scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight,
      lyrics:document.querySelector('.lyrics-panel').getBoundingClientRect().toJSON(), words:document.querySelector('.word-panel').getBoundingClientRect().toJSON(), status:document.querySelector('.desktop-statusbar').getBoundingClientRect().toJSON() }))
    assert.ok(bounds.scrollWidth <= bounds.width && bounds.scrollHeight <= bounds.height)
    assert.ok(bounds.lyrics.width > 300 && bounds.words.width > 230)
    assert.ok(bounds.words.right <= bounds.width && bounds.lyrics.bottom <= bounds.status.top + 1)
    assert.equal(await page.locator('.desktop-player').count(), 0)
    await page.screenshot({ path:path.join(evidence, `desktop-${width}.png`) })
  }
  assert.ok(!/未能开始播放|未能继续播放/.test(await page.locator('.desktop-statusbar').innerText()))
  await page.getByRole('button', { name: '加入今日复习', exact: false }).click()
  await shortcut('3')
  await page.locator('.desktop-review li').first().getByRole('button', { name:'前往跟唱' }).click()
  await page.locator('.desktop-sing').waitFor()
  assert.equal(await page.locator('.desktop-shell-singalong').count(), 1)
  for (const [width, height] of [[1024, 768], [1440, 960]]) {
    await client.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height])
    const immersive = await page.evaluate(() => {
      const shell = document.querySelector('.desktop-shell-singalong')
      const main = shell.querySelector('main#top').getBoundingClientRect()
      const title = shell.querySelector('.desktop-titlebar').getBoundingClientRect()
      const player = shell.querySelector('.desktop-player').getBoundingClientRect()
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
        sidebar: getComputedStyle(shell.querySelector('.desktop-sidebar')).display,
        status: getComputedStyle(shell.querySelector('.desktop-statusbar')).display,
        titleBackground: getComputedStyle(shell.querySelector('.desktop-titlebar')).backgroundColor,
        playerBackground: getComputedStyle(shell.querySelector('.desktop-player')).backgroundColor,
        main: main.toJSON(), title: title.toJSON(), player: player.toJSON() }
    })
    assert.equal(immersive.sidebar, 'none')
    assert.equal(immersive.status, 'none')
    assert.equal(immersive.main.left, 0)
    assert.equal(immersive.title.left, 0)
    assert.equal(immersive.title.top, 0)
    assert.equal(immersive.player.left, 0)
    assert.equal(immersive.main.width, immersive.width)
    assert.equal(immersive.player.width, immersive.width)
    assert.equal(immersive.player.bottom, immersive.height)
    assert.ok(immersive.scrollWidth <= immersive.width)
    assert.ok(immersive.player.bottom <= immersive.height + 1)
    assert.notEqual(immersive.titleBackground, 'rgba(0, 0, 0, 0)')
    assert.notEqual(immersive.playerBackground, 'rgba(0, 0, 0, 0)')
  }
  assert.equal(await page.getByRole('heading', { name: '逐句练习' }).count(), 0)
  assert.equal(await page.locator('.desktop-sing-list li').count(), 4)
  await page.getByRole('button', { name: '从第 4 句开始跟唱' }).click()
  await page.waitForFunction(() => { const audio = document.querySelector('audio'); return !audio.paused && audio.currentTime >= 4 && audio.currentTime < 4.7 })
  await page.getByRole('button', { name: '从第 4 句开始跟唱' }).click()
  assert.equal(await page.locator('audio').evaluate(audio => audio.paused), false)
  await page.getByLabel('歌曲播放速度').selectOption('0.5')
  assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 0.5)
  await page.getByLabel('播放进度').fill('0.3')
  assert.ok(Math.abs(await page.locator('audio').evaluate(audio => audio.currentTime) - 0.3) < 0.1)
  await page.getByLabel('音量', { exact:true }).fill('0.5')
  assert.equal(await page.locator('audio').evaluate(audio => audio.volume), 0.5)
  await page.getByRole('button', { name:'播放上一句', exact:true }).click()
  await page.waitForFunction(() => document.querySelector('audio').currentTime >= 2)
  await page.getByRole('button', { name:'暂停歌曲', exact:true }).click()
  await page.getByRole('button', { name: '自定义背景' }).click()
  await page.getByLabel('选择跟唱背景图片').setInputFiles(path.join(root, 'src', 'assets', 'uta-twilight-station.png'))
  await page.getByRole('button', { name: '应用背景' }).click()
  await page.waitForFunction(() => document.querySelector('.desktop-sing-wallpaper')?.style.backgroundImage.startsWith('url("blob:'))
  await page.waitForFunction(() => document.querySelector('.desktop-shell-singalong')?.style.getPropertyValue('--sing-background-image').startsWith('url("blob:'))
  await page.waitForFunction(async () => {
    const wallpaper = document.querySelector('.desktop-sing-wallpaper')
    const value = getComputedStyle(wallpaper).backgroundImage
    const source = value.slice(5, -2)
    const image = new Image()
    image.src = source
    try { await image.decode(); return image.naturalWidth > 0 } catch { return false }
  })
  const singLayout = await page.evaluate(() => ({
    stage: document.querySelector('.desktop-sing').getBoundingClientRect().toJSON(),
    header: document.querySelector('.desktop-sing-player-header').getBoundingClientRect().toJSON(),
    scrollX: document.querySelector('.desktop-sing').scrollLeft,
    scrollY: document.querySelector('.desktop-sing').scrollTop,
  }))
  if (singLayout.header.left < singLayout.stage.left || singLayout.header.top < singLayout.stage.top) console.error('Sing-along layout:', singLayout)
  assert.ok(singLayout.header.left >= singLayout.stage.left && singLayout.header.top >= singLayout.stage.top)
  assert.equal(singLayout.scrollX, 0)
  assert.equal(singLayout.scrollY, 0)
  const singWindow = await page.evaluate(() => {
    const shell = document.querySelector('.desktop-shell-singalong')
    return { scrollY, htmlScroll: document.documentElement.scrollTop, bodyScroll: document.body.scrollTop, shellScroll: shell.scrollTop, height: innerHeight,
      shellPosition: getComputedStyle(shell).position, shell: shell.getBoundingClientRect().toJSON(),
      title: shell.querySelector('.desktop-titlebar').getBoundingClientRect().toJSON(), player: shell.querySelector('.desktop-player').getBoundingClientRect().toJSON() }
  })
  assert.equal(singWindow.shell.top, 0, JSON.stringify(singWindow))
  assert.equal(singWindow.shellScroll, 0, JSON.stringify(singWindow))
  assert.equal(singWindow.title.top, 0)
  assert.equal(singWindow.player.bottom, singWindow.height)
  await page.screenshot({ path:path.join(evidence, 'singalong-player-background.png') })
  // Leaving continuous playback must also end its audio session and lyric following.
  await page.getByLabel('歌曲播放速度').selectOption('1')
  await page.getByRole('button', { name: '从第 1 句开始跟唱' }).click()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await page.getByRole('button', { name:'返回学习' }).click()
  await page.getByRole('heading', { name:'逐句读音' }).waitFor()
  assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true, 'Returning to learning must stop the song')
  const stoppedTime = await page.locator('audio').evaluate(audio => audio.currentTime)
  const selectedLine = await page.locator('.lyrics-list .lyric-row.active').getAttribute('id')
  await page.waitForTimeout(1100)
  assert.ok(Math.abs(await page.locator('audio').evaluate(audio => audio.currentTime) - stoppedTime) < 0.05)
  // A queued media event must not reinstate the old continuous-playback highlight.
  await page.locator('audio').evaluate(audio => { audio.currentTime = 2.1; audio.dispatchEvent(new Event('timeupdate')) })
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.lyrics-list .desktop-now-playing').count(), 0)
  assert.equal(await page.locator('.lyrics-list .lyric-row.active').getAttribute('id'), selectedLine)
  await page.locator('.lyrics-list .lyric-row').first().locator('.line-number').dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await page.waitForFunction(() => document.querySelector('audio').paused && document.querySelector('audio').currentTime >= 0.95)
  assert.ok(await page.locator('audio').evaluate(audio => audio.currentTime) < 1.1, 'Single-line playback must still stop at the next timestamp')
  assert.equal(await page.locator('.desktop-shell-singalong').count(), 0)
  assert.equal(await page.locator('.desktop-sidebar').evaluate(node => getComputedStyle(node).display), 'flex')
  await page.locator('.desktop-sidebar nav').getByRole('button', { name:'跟唱练习' }).click()
  await page.waitForFunction(() => document.querySelector('.desktop-sing-wallpaper')?.style.backgroundImage.startsWith('url("blob:'))
  await page.waitForFunction(() => document.querySelector('.desktop-shell-singalong')?.style.getPropertyValue('--sing-background-image').startsWith('url("blob:'))
  await page.getByRole('button', { name: '从第 3 句开始跟唱' }).click()
  await page.waitForFunction(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime >= 2)
  await shortcut('1')
  await page.getByRole('heading', { name:'逐句读音' }).waitFor()
  assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true, 'The native learning shortcut must stop continuous playback too')
  assert.equal(await page.locator('.lyrics-list .desktop-now-playing').count(), 0)
  await page.locator('.desktop-sidebar nav').getByRole('button', { name:'跟唱练习' }).click()
  // Hold metadata loading so return is tested before playback can start.
  await page.locator('audio').evaluate(audio => {
    Object.defineProperty(audio, 'readyState', { configurable: true, value: 0 })
    audio.load = () => {}
  })
  await page.getByRole('button', { name: '从第 1 句开始跟唱' }).click()
  await page.getByRole('button', { name:'返回学习' }).click()
  await page.locator('audio').evaluate(audio => {
    delete audio.readyState; delete audio.load
    audio.dispatchEvent(new Event('loadedmetadata'))
    audio.dispatchEvent(new Event('timeupdate'))
  })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true, 'Late metadata must not restart a song after return')
  assert.equal(await page.locator('.lyrics-list .desktop-now-playing').count(), 0)
  assert.equal(await page.evaluate(() => typeof require), 'undefined')
  await page.evaluate(async () => { localStorage.setItem('desktop-persistence-test', 'persisted'); await window.utaDesktop.saveCredential('desktop-encrypted-test-key'); })
  const credentialBytes = await fs.readFile(path.join(testDir, 'uta-data', 'ai-credential.bin'))
  assert.equal(credentialBytes.includes(Buffer.from('desktop-encrypted-test-key')), false)
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'desktop-encrypted-test-key')

  const backup = path.join(testDir, 'uta-data', 'backups', 'smoke.uta-backup')
  await client.evaluate(({ dialog, BrowserWindow }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename })
    BrowserWindow.getAllWindows()[0].webContents.session.on('will-download', (_event, item) => {
      globalThis.__utaSmokeDownloadState = item.getState()
      item.on('done', (_event, state) => { globalThis.__utaSmokeDownloadState = state })
    })
  }, backup)
  await shortcut(',')
  await page.locator('.settings-dialog').waitFor()
  await page.screenshot({ path:path.join(evidence, 'desktop-settings.png') })
  await page.getByRole('button', { name:'主题设置', exact:true }).click()
  const sizeSlider=page.getByRole('slider', { name:'歌词上方假名字体大小', exact:true })
  assert.equal(await sizeSlider.inputValue(),'10')
  const lineSizeSlider=page.getByRole('slider', { name:'词语下方罗马音字体大小', exact:true })
  assert.equal(await lineSizeSlider.inputValue(),'11')
  const lyricFont=await page.locator('.japanese').first().evaluate(element=>getComputedStyle(element).fontSize)
  for(const value of ['8','24']) {
    await sizeSlider.fill(value)
    await page.waitForFunction(size=>getComputedStyle(document.querySelector('.lyrics-list .token-reading-kana')).fontSize === size+'px',value)
    assert.equal(await page.locator('.reading-font-preview .token-reading-kana').first().evaluate(element=>getComputedStyle(element).fontSize),value+'px')
    assert.equal(await page.locator('.japanese').first().evaluate(element=>getComputedStyle(element).fontSize),lyricFont)
    assert.equal(await page.locator('.lyrics-list .reading').count(),0)
  }
  await page.getByRole('button', { name:'恢复默认字号', exact:true }).click()
  assert.equal(await sizeSlider.inputValue(),'10')
  await sizeSlider.fill('16')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).readingFontSize === 16)
  await page.locator('input[name="reading-style"][value="romaji"]').check()
  await page.locator('.lyrics-list .word-aligned-romaji').first().waitFor()
  assert.equal(await page.locator('.lyrics-list .reading').count(),0)
  assert.equal(await page.locator('.lyrics-list rt').count(),0)
  for(const value of ['8','24']) {
    await lineSizeSlider.fill(value)
    await page.waitForFunction(size=>getComputedStyle(document.querySelector('.lyrics-list .token-reading-romaji')).fontSize === size+'px',value)
    assert.equal(await page.locator('.reading-font-preview .token-reading-romaji').first().evaluate(element=>getComputedStyle(element).fontSize),value+'px')
    assert.equal(await page.locator('.lyrics-list .token-reading-kana').first().evaluate(element=>getComputedStyle(element).fontSize),'16px')
    assert.equal(await page.locator('.japanese').first().evaluate(element=>getComputedStyle(element).fontSize),lyricFont)
  }
  await page.getByRole('button', { name:'恢复罗马音默认字号', exact:true }).click()
  assert.equal(await lineSizeSlider.inputValue(),'11')
  await lineSizeSlider.fill('20')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).lineReadingFontSize === 20)
  const translationSize = page.getByRole('slider', { name:'翻译字体大小', exact:true })
  assert.equal(await translationSize.inputValue(), '12')
  for (const value of ['10', '24']) {
    await translationSize.fill(value)
    await page.waitForFunction(size => getComputedStyle(document.querySelector('.lyric-translation')).fontSize === size + 'px', value)
    assert.equal(await page.locator('.reading-font-preview .reading-preview-translation').evaluate(element => getComputedStyle(element).fontSize), value + 'px')
    assert.equal(await page.locator('.japanese').first().evaluate(element => getComputedStyle(element).fontSize), lyricFont)
    assert.equal(await page.locator('.lyrics-list .token-reading-kana').first().evaluate(element => getComputedStyle(element).fontSize), '16px')
  }
  await page.getByRole('button', { name:'恢复翻译默认字号', exact:true }).click()
  assert.equal(await translationSize.inputValue(), '12')
  await translationSize.fill('18')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).translationFontSize === 18)
  assert.equal(await page.locator('.reading-font-preview .token-reading-romaji').first().textContent(),'gakkou')
  assert.equal(await page.locator('.reading-font-preview .token-reading-romaji').nth(1).textContent(),'e')
  await page.locator('input[name="reading-style"][value="both"]').check()
  await page.locator('.lyrics-list .word-aligned').first().waitFor()
  assert.ok((await page.locator('.lyrics-list .token-reading-kana').filter({hasText:/\S/}).first().textContent()).length>0)
  assert.ok((await page.locator('.lyrics-list .token-reading-romaji').filter({hasText:/\S/}).first().textContent()).length>0)
  assert.equal(await page.locator('.lyrics-list .reading').count(),0)
  assert.equal(await lyricRows.first().locator('.lyric-token').first().locator('.token-reading-romaji').textContent(),'')
  assert.equal(await page.getByRole('slider',{name:'词语下方罗马音字体大小',exact:true}).inputValue(),'20')
  await page.getByRole('button', { name:'关闭设置', exact:true }).click()
  const alignedBounds = await page.evaluate(() => [...document.querySelectorAll('.lyrics-list .lyric-token')].map(token => {
    const base=token.querySelector('.token-reading-surface').getBoundingClientRect()
    const roman=token.querySelector('.token-reading-romaji').getBoundingClientRect()
    const box=token.getBoundingClientRect()
    return { base:base.toJSON(), roman:roman.toJSON(), box:box.toJSON() }
  }))
  for (const { base, roman, box } of alignedBounds) {
    assert.ok(roman.top >= base.bottom - 1)
    assert.ok(roman.left >= box.left - 1 && roman.right <= box.right + 1)
  }
  await assertRomanAlignment(page)
  assert.equal(await page.locator('.lyric-translation').first().evaluate(element=>getComputedStyle(element).textAlign),'left')
  await lyricRows.nth(1).locator('.token-reading-romaji').first().click()
  assert.equal(await page.locator('.word-main h3').innerText(), await lyricRows.nth(1).locator('.token-reading-surface').first().textContent())
  await lyricRows.first().locator('.line-number').click()
  await lyricRows.nth(1).locator('.token-reading-romaji').first().click({modifiers:['Control']})
  assert.equal(await page.locator('.desktop-range-selected').count(),2)
  await page.getByRole('button',{name:'取消歌词多选',exact:true}).click()
  await lessonDisplay.selectOption('lyrics')
  assert.equal(await page.locator('.lyrics-list .token-reading').count(),0)
  await lessonDisplay.selectOption('both')
  await page.screenshot({path:path.join(evidence,'combined-kana-romaji.png')})
  await shortcut(',')
  await page.locator('.settings-dialog').waitFor()
  await page.getByRole('button', { name:'主题设置', exact:true }).click()
  await page.getByRole('radio', { name:/平假名/ }).check()
  await page.screenshot({path:path.join(evidence,'reading-font-size.png')})
  await page.getByRole('button', { name:'关闭设置', exact:true }).click()
  await page.screenshot({path:path.join(evidence,'independent-reading-size.png')})
  await shortcut(',')
  await page.getByRole('button', { name:'主题设置', exact:true }).click()
  await page.locator('[data-theme-card="crimson-blade"]').click()
  const themeColors = await page.evaluate(() => ({
    surface:getComputedStyle(document.querySelector('.desktop-theme-sample')).backgroundColor,
    accent:getComputedStyle(document.querySelector('.desktop-theme-sample button')).backgroundColor,
  }))
  await page.getByRole('button', { name:'关闭设置', exact:true }).click()
  await lyricRows.first().locator('.line-number').click({ button:'right' })
  await page.getByRole('menuitem', { name:/编辑歌词/ }).click()
  assert.equal(await page.locator('.line-editor').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.surface)
  assert.equal(await page.locator('.line-editor footer button:last-child').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.accent)
  await page.getByRole('button', { name:'自定义分词' }).click()
  assert.equal(await page.locator('.segmentation-dialog').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.surface)
  assert.equal(await page.locator('.segmentation-dialog footer button:last-child').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.accent)
  await page.locator('.segmentation-dialog').getByRole('button', { name:'取消' }).click()
  await page.getByRole('button', { name:'关闭歌词编辑' }).click()
  await page.locator('.desktop-sidebar nav').getByRole('button', { name:'歌曲库' }).click()
  await page.getByRole('button', { name:'编辑歌曲信息' }).click()
  assert.equal(await page.locator('.song-editor').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.surface)
  assert.equal(await page.locator('.song-editor-actions button:last-child').evaluate(node => getComputedStyle(node).backgroundColor), themeColors.accent)
  await page.getByRole('button', { name:'关闭编辑' }).click()
  await page.locator('.desktop-sidebar nav').getByRole('button', { name:'发音学习' }).click()
  await shortcut(',')
  await page.getByRole('button', { name:'主题设置', exact:true }).click()
  await page.locator('[data-theme-card="star-indigo"]').click()
  await page.getByRole('button', { name:'关闭设置', exact:true }).click()
  await shortcut('O')
  await page.locator('.song-import-dialog').getByRole('button',{name:'批量导入',exact:true}).click()
  const batch=page.locator('.batch-import-dialog')
  assert.equal(await batch.locator('input[aria-label="批量选择音频文件"]').getAttribute('multiple'),'')
  const batchAudioNames=['雨.wav','春.wav','手動.wav','壊れ.wav','未選択.wav']
  await batch.getByLabel('批量选择音频文件',{exact:true}).setInputFiles(batchAudioNames.map(name=>({name,mimeType:'audio/wav',buffer:wav})))
  await page.waitForFunction(()=>!document.querySelector('.batch-import-progress') && document.querySelector('.batch-import-rows')?.children.length===5)
  await batch.getByLabel('批量选择歌词文件',{exact:true}).setInputFiles([
    {name:'春.lrc',mimeType:'text/plain',buffer:Buffer.from('[ti:春の歌]\n[ar:UTA春]\n[00:00.00]はるが来る。\n')},
    {name:'違う名前.lrc',mimeType:'text/plain',buffer:Buffer.from('[ti:手動原曲]\n[00:00.00]そらを見よう。\n')},
    {name:'雨.lrc',mimeType:'text/plain',buffer:Buffer.from('[ti:雨の歌]\n[ar:UTA雨]\n[00:00.00]あめが降る。\n')},
    {name:'壊れ.lrc',mimeType:'text/plain',buffer:Buffer.from('no timestamp or Japanese lyrics')},
    {name:'未選択.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]うたを歌う。\n')},
    {name:'孤立.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]ゆめを見よう。\n')},
  ])
  await batch.getByRole('button',{name:'导入选中的 3 首歌曲',exact:true}).waitFor()
  assert.equal(await batch.getByLabel('第 1 首对应歌词',{exact:true}).locator('option:checked').textContent(),'雨.lrc')
  assert.equal(await batch.getByLabel('第 2 首对应歌词',{exact:true}).locator('option:checked').textContent(),'春.lrc')
  assert.equal(await batch.getByLabel('第 3 首对应歌词',{exact:true}).inputValue(),'')
  assert.equal(await batch.getByLabel('选择第 4 首歌曲',{exact:true}).isDisabled(),true)
  assert.match(await batch.locator('.batch-import-row').nth(3).innerText(),/未在 LRC 中找到/)
  await batch.getByLabel('第 3 首对应歌词',{exact:true}).selectOption({label:'違う名前.lrc'})
  await batch.getByLabel('第 3 首歌曲名',{exact:true}).fill('批量手動テスト')
  await batch.getByLabel('第 3 首歌手',{exact:true}).fill('UTA手動')
  await batch.getByLabel('选择第 5 首歌曲',{exact:true}).uncheck()
  // Adding another audio preserves manually reviewed pairings and deselection.
  await batch.getByLabel('批量选择音频文件',{exact:true}).setInputFiles({name:'追加.wav',mimeType:'audio/wav',buffer:wav})
  await page.waitForFunction(()=>!document.querySelector('.batch-import-progress'))
  assert.equal(await batch.locator('.batch-import-row').count(),6)
  assert.equal(await batch.getByLabel('第 3 首歌曲名',{exact:true}).inputValue(),'批量手動テスト')
  assert.equal(await batch.getByLabel('选择第 5 首歌曲',{exact:true}).isChecked(),false)
  for(const [width,height,zoom] of [[1000,680,1],[1440,960,1],[1024,768,1.5]]) {
    await client.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.setSize(size[0],size[1]);window.webContents.setZoomFactor(size[2])},[width,height,zoom])
    const bounds=await batch.evaluate(dialog=>{const footer=dialog.querySelector('.batch-import-footer').getBoundingClientRect();const content=dialog.querySelector('.batch-import-content');return {bottom:footer.bottom,height:innerHeight,width:content.clientWidth,scrollWidth:content.scrollWidth}})
    assert.ok(bounds.bottom<=bounds.height && bounds.scrollWidth<=bounds.width+1)
  }
  await client.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setZoomFactor(1);window.setSize(1440,960)})
  await page.screenshot({path:path.join(evidence,'batch-import.png')})
  const localRecords=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('uta-local-song-library');request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{const database=request.result,all=database.transaction('songs').objectStore('songs').getAll();all.onsuccess=()=>{database.close();resolve(all.result.map(song=>({title:song.title,artist:song.artist,audioName:song.audioName,size:song.audioBlob.size,sourceFile:song.sourceFile,text:song.lines[0].text})))}}
  }))
  const countBeforeBatch=(await localRecords()).length
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.add;let calls=0
    IDBObjectStore.prototype.add=function(...args){
      if(this.name==='songs' && ++calls===2){IDBObjectStore.prototype.add=original;throw new DOMException('模拟存储空间不足','QuotaExceededError')}
      return original.apply(this,args)
    }
  })
  await batch.getByRole('button',{name:'导入选中的 3 首歌曲',exact:true}).click()
  await batch.getByRole('alert').waitFor()
  assert.match(await batch.getByRole('alert').innerText(),/模拟存储空间不足/)
  assert.equal((await localRecords()).length,countBeforeBatch)
  await batch.getByRole('button',{name:'导入选中的 3 首歌曲',exact:true}).click()
  await batch.waitFor({state:'detached'})
  const batchRecords=await localRecords()
  assert.equal(batchRecords.length,countBeforeBatch+3)
  for(const [title,artist,audioName,sourceFile,text] of [
    ['雨の歌','UTA雨','雨.wav','雨.lrc','あめが降る。'],['春の歌','UTA春','春.wav','春.lrc','はるが来る。'],
    ['批量手動テスト','UTA手動','手動.wav','違う名前.lrc','そらを見よう。']
  ]) assert.ok(batchRecords.some(song=>song.title===title && song.artist===artist && song.audioName===audioName && song.sourceFile===sourceFile && song.text===text && song.size===wav.length))
  assert.ok(!batchRecords.some(song=>['壊れ.wav','未選択.wav','追加.wav'].includes(song.audioName)))
  await shortcut('1')
  await shortcut(',')
  await page.locator('.settings-dialog').waitFor()

  await page.getByRole('button', { name:'AI 服务', exact:true }).click()
  await page.getByRole('button', { name:'其他兼容服务', exact:true }).click()
  await page.getByLabel('供应商名称', { exact:true }).fill('Windows settings test')
  await page.getByLabel('API 地址', { exact:true }).fill(mockOrigin)
  await page.getByLabel('API Key', { exact:true }).fill('mock-settings-key')
  await page.getByLabel('模型名称', { exact:true }).fill('test')
  await page.getByLabel('在这台电脑上记住 API Key', { exact:true }).check()
  // The action bar must stay inside the clipped dialog before and after scrolling.
  for (const [width,height,zoom] of [[1000,680,1],[1024,768,1],[1440,960,1],[1024,768,1.25],[1024,768,1.5]]) {
    await client.evaluate(({BrowserWindow}, size) => {
      const window=BrowserWindow.getAllWindows()[0]; window.setSize(size[0],size[1]); window.webContents.setZoomFactor(size[2]);
    },[width,height,zoom])
    await page.waitForTimeout(250)
    for (const scroll of [0,10000]) {
      await page.locator('.settings-ai-fields').evaluate((element,top)=>{element.scrollTop=top},scroll)
      const bounds=await page.evaluate(()=>{
        const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        return {height:innerHeight,width:innerWidth,dialog:rect('.settings-dialog'),footer:rect('.settings-ai-footer'),actions:rect('.settings-form-actions'),fields:rect('.settings-ai-fields')};
      })
      assert.ok(bounds.actions.top >= bounds.dialog.top && bounds.actions.bottom <= bounds.dialog.bottom && bounds.actions.bottom <= bounds.height,JSON.stringify(bounds))
      assert.ok(bounds.actions.left >= bounds.dialog.left && bounds.actions.right <= bounds.dialog.right && bounds.actions.right <= bounds.width)
      assert.ok(bounds.fields.bottom <= bounds.footer.top + 1 && bounds.fields.height > 90)
    }
    if(zoom === 1) await page.screenshot({path:path.join(evidence,`ai-settings-${width}.png`)})
  }
  await client.evaluate(({BrowserWindow})=>{ const window=BrowserWindow.getAllWindows()[0];window.setSize(1024,768);window.webContents.setZoomFactor(1) })
  await page.getByRole('button', { name:'测试连接', exact:true }).click()
  await page.locator('.settings-ai-footer').getByRole('status').filter({hasText:'连接成功'}).waitFor({timeout:15000})
  await page.getByRole('button', { name:'保存设置', exact:true }).click()
  await page.locator('.settings-ai-footer').getByRole('status').filter({hasText:'已保存'}).waitFor()
  assert.equal(await page.evaluate(()=>window.utaDesktop.loadCredential()),'mock-settings-key')
  const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('uta-ai-provider-v1')))
  assert.equal(settings.base_url,mockOrigin);assert.equal(settings.model,'test');assert.equal(settings.rememberKey,true)
  assert.equal(Object.hasOwn(settings,'api_key'),false)
  await page.getByRole('button', { name:'关闭设置', exact:true }).click()
  await shortcut(',')
  await page.getByRole('button', { name:'AI 服务', exact:true }).click()
  assert.equal(await page.getByLabel('API Key', { exact:true }).inputValue(),'mock-settings-key')
  await page.screenshot({path:path.join(evidence,'ai-settings-fixed.png')})
  // Restore the dummy credential used by the existing restart check.
  await page.evaluate(()=>window.utaDesktop.saveCredential('desktop-encrypted-test-key'))
  await page.getByRole('button', { name:'数据管理', exact:true }).click()

  await page.getByRole('button', { name: '导出备份', exact: false }).click()
  for (let i = 0; i < 150; i++) {
    if (await client.evaluate(() => globalThis.__utaSmokeDownloadState === 'completed')) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.equal(await client.evaluate(() => globalThis.__utaSmokeDownloadState), 'completed')
  assert.ok((await fs.stat(backup)).size > wav.length)
  const inspectedBackup=await inspectLearningBackup(new Blob([await fs.readFile(backup)]))
  assert.equal(inspectedBackup.manifest.progress.readingFontSize,16)
  assert.equal(inspectedBackup.manifest.progress.lineReadingFontSize,20)
  assert.equal(inspectedBackup.manifest.progress.translationFontSize,18)
  assert.deepEqual(inspectedBackup.manifest.progress.rangePracticeSettings, { mode:'repeat', repeatCount:3, gapSeconds:2 })
  assert.ok(inspectedBackup.manifest.songs.some(song=>song.title==='批量手動テスト' && song.audioName==='手動.wav'))
  assert.equal(inspectedBackup.manifest.songs.length,4)
  const restoreFixture = path.join(root, 'work', 'restore-smoke-fixture.uta-backup')
  await fs.copyFile(backup, restoreFixture)
  await client.close(); client = null
  page = await launch()
  assert.equal(await page.evaluate(() => localStorage.getItem('desktop-persistence-test')), 'persisted')
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).rangePracticeSettings), { mode:'repeat', repeatCount:3, gapSeconds:2 })
  assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true)
  // Select the annotated fixture before checking sizes: the last imported song
  // may contain only kana, whose intentionally empty ruby slots are invisible.
  await page.locator('.desktop-recent button').filter({hasText:'Windows便携测试'}).click()
  await page.locator('.lyrics-list .token-reading-kana').filter({hasText:/\S/}).first().waitFor()
  assert.equal(await page.locator('.lyrics-list .token-reading-kana').first().evaluate(element=>getComputedStyle(element).fontSize),'16px')
  assert.equal(await page.locator('.lyrics-list .token-reading-romaji').first().evaluate(element=>getComputedStyle(element).fontSize),'20px')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).translationFontSize),18)
  await page.locator('.desktop-recent button').filter({hasText:'Windows便携测试'}).click()
  assert.deepEqual(await page.locator('.lyrics-list .lyric-row').first().locator('.token-reading-surface').allTextContents().then(items=>items.slice(0,2)),['学','校'])
  assert.equal(await page.locator('.lyric-translation').first().evaluate(element=>getComputedStyle(element).fontSize),'18px')
  const songs = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('uta-local-song-library'); request.onerror = () => reject(request.error)
    request.onsuccess = () => { const database = request.result, all = database.transaction('songs').objectStore('songs').getAll();
      all.onsuccess = () => { database.close(); resolve(all.result.map((song) => ({ title: song.title, size: song.audioBlob.size }))) }; }
  }))
  assert.ok(songs.some((song) => song.title === 'Windows便携测试' && song.size === wav.length))
  assert.equal(songs.length,4)
  assert.ok(songs.some(song=>song.title==='批量手動テスト' && song.size===wav.length))
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'desktop-encrypted-test-key')
  dataProtectionChecks = await runDataProtectionChecks({ page, client, testDir, evidence, backup: restoreFixture })
  await client.close(); client = null

  // Verify private API authentication and automatic child exit when stdin closes.
  const child = spawn(path.join(testDir, 'versions', runtime.version, 'backend', 'uta-backend.exe'), [], { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const token = randomBytes(32).toString('hex')
  child.stdin.write(JSON.stringify({ token }) + '\n')
  try {
    const origin = await new Promise((resolve, reject) => {
      let text = '', errors = ''
      const timer = setTimeout(() => reject(new Error('Backend timeout: ' + errors)), 60000)
      child.stderr.on('data', (chunk) => { errors += chunk.toString() })
      child.on('error', reject); child.on('exit', (code) => reject(new Error('Backend exited: ' + code + ' ' + errors)))
      child.stdout.on('data', (chunk) => { text += chunk.toString(); const match = /UTA_BACKEND_READY (.+)\r?\n/.exec(text); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + JSON.parse(match[1]).port) } })
    })
    for (let i = 0; i < 40; i++) { try { await fetch(origin + '/api/health'); break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) } }
    assert.equal((await fetch(origin + '/api/health')).status, 403)
    assert.equal((await fetch(origin + '/api/health', { headers: { 'X-UTA-Desktop-Token': token } })).status, 200)
    const exited = once(child, 'exit'); child.stdin.end(); await exited
  } finally { child.kill() }
  assert.deepEqual(failures, [])
  const report = { passed: true, runtime, checks: ['packaged-exe', 'relocated-chinese-space-path', 'no-system-node-python', 'bundled-sudachi-tomoshi', 'ai-proxy-mock',
    'ui-import-wav-lrc', 'backup-export', 'indexeddb-localstorage-restart', 'windows-encrypted-key', 'renderer-isolation', 'api-authentication', 'parent-exit-cleanup', 'native-titlebar-shortcuts', 'library-filter-sort-search', 'lesson-display-dropdown-four-modes', 'lesson-player-removed', 'double-click-line-playback', 'themed-song-lyric-segmentation-editors', 'singalong-player-seek-volume-speed', 'independent-panes-1024-1440', 'review-opens-singalong', 'ai-settings-visible-footer-small-window-and-zoom', 'ai-settings-test-and-save-through-ui', 'ctrl-contiguous-lines-token-and-reverse-selection', 'selected-range-exact-start-stop-and-tail', 'selected-range-slow-pause-resume-replay', 'single-line-lead-in-preserved', 'right-click-line-edit-and-hidden-word', 'combined-kana-romaji', 'batch-import-matching-manual-and-selection', 'batch-import-atomic-failure-retry', 'batch-import-restart-and-backup', 'independent-line-and-ruby-reading-sizes', 'reading-size-live-preview-reset', 'reading-size-restart-and-backup', ...rangePracticeChecks, ...dataProtectionChecks] }
  report.checks.push('singalong-return-stops-audio-and-highlighting', 'singalong-return-preserves-single-line-playback', 'singalong-native-learning-shortcut-stops-audio', 'singalong-return-cancels-pending-metadata-playback')
  await fs.writeFile(path.join(evidence, 'desktop-smoke.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  if (client) {
    const page=await client.firstWindow().catch(()=>null)
    if(page) {
      await page.screenshot({path:path.join(evidence,'desktop-failure.png')}).catch(()=>{})
      console.error(await page.locator('.batch-import-dialog').innerText().catch(()=>''))
    }
  }
  throw error
} finally { if (client) await client.close().catch(() => {}); mock.close(); }
