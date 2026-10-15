import assert from 'node:assert/strict'
import path from 'node:path'

// Exercise the actual controls and media events. Only the clip's media clock is
// advanced; silence still uses real time, so cancellation and pause are tested.
export async function runRangePracticeChecks({ page, client, evidence }) {
  const controls = page.getByRole('region', { name:'选中歌词片段', exact:true })
  const rows = page.locator('.lyrics-list .lyric-row')
  const phase = async (value, completed) => {
    await page.waitForFunction(({ value, completed }) => {
      const section = document.querySelector('.desktop-lyric-range-controls')
      return section?.dataset.practicePhase === value && (completed == null || Number(section.dataset.completed) === completed)
    }, { value, completed }, { timeout:5000 })
    if (value === 'playing') await controls.getByRole('button', { name:'暂停选中片段', exact:true }).waitFor()
  }
  const starts = () => page.evaluate(() => window.__practiceStarts)
  const select = async (first = 0, last = 1) => {
    await rows.nth(first).locator('.line-number').click()
    await rows.nth(last).locator('.line-number').click({ modifiers:['Control'] })
    await controls.waitFor()
  }
  const resetLog = () => page.evaluate(() => { window.__practiceStarts = []; window.__practiceEnds = [] })
  const finish = async (end = 2, ended = false) => {
    await page.locator('audio').evaluate((audio, { end, ended }) => {
      window.__practiceEnds.push(performance.now())
      audio.currentTime = end
      audio.dispatchEvent(new Event('timeupdate'))
      if (ended) audio.dispatchEvent(new Event('ended'))
    }, { end, ended })
  }
  const begin = async () => { await controls.getByRole('button', { name:'播放选中片段', exact:true }).click(); await phase('playing', 0) }
  const configure = async (count, gap = '1') => {
    await page.getByLabel('选段练习方式', { exact:true }).selectOption('repeat')
    await page.getByLabel('选段播放次数', { exact:true }).selectOption(String(count))
    await page.getByLabel('选段跟读间隔', { exact:true }).selectOption(gap)
  }
  const pauseNoRestart = async (count, milliseconds = 1200) => {
    await page.waitForTimeout(milliseconds)
    assert.equal((await starts()).length, count)
    assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true)
  }
  await page.evaluate(() => {
    window.__practiceStarts = []; window.__practiceEnds = []
    window.__practiceOriginalPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      window.__practiceStarts.push({ time:this.currentTime, rate:this.playbackRate, at:performance.now() })
      return window.__practiceOriginalPlay.apply(this, args)
    }
  })
  try {
    await select()
    assert.equal(await page.getByLabel('选段播放次数', { exact:true }).inputValue(), '1')
    assert.deepEqual(await page.getByLabel('选段播放速度', { exact:true }).locator('option').evaluateAll(options => options.map(option => Number(option.value))), [1, 0.75, 0.5, 0.25])
    await configure(3, '3')
    await page.getByLabel('选段播放速度', { exact:true }).selectOption('0.5')
    await begin()
    await finish()
    await phase('gap', 1)
    await controls.getByRole('button', { name:'暂停选中片段', exact:true }).click()
    await page.screenshot({ path:path.join(evidence, 'range-practice-repeat.png') })
    assert.equal((await starts()).length, 1)
    await page.getByLabel('选段播放速度', { exact:true }).selectOption('0.25')
    await controls.getByRole('button', { name:'继续选中片段', exact:true }).click()
    await phase('playing', 1)
    assert.deepEqual((await starts()).map(({time,rate}) => ({time,rate})), [{ time:0.5, rate:0.5 }, { time:0.5, rate:0.25 }])
    assert.ok((await starts())[1].at - await page.evaluate(() => window.__practiceEnds[0]) >= 2900)
    await finish()
    await phase('gap', 2)
    // The main player must pause the silence as well as the range toolbar.
    await page.getByRole('button', { name:'暂停歌曲', exact:true }).click()
    assert.equal(await controls.getAttribute('data-practice-paused'), 'true')
    await pauseNoRestart(2)
    await controls.getByRole('button', { name:'继续选中片段', exact:true }).click()
    await phase('playing', 2)
    assert.equal((await starts()).length, 3)
    await finish()
    await phase('complete', 3)
    await pauseNoRestart(3)
    assert.equal(await page.locator('audio').evaluate(audio => audio.currentTime), 2)

    await configure(5)
    await resetLog()
    await begin()
    for (let completed = 1; completed <= 5; completed++) {
      await finish()
      await phase(completed === 5 ? 'complete' : 'gap', completed)
      if (completed < 5) await phase('playing', completed)
    }
    assert.equal((await starts()).length, 5)
    assert.ok((await starts()).every(call => call.time === 0.5))

    await configure('infinite')
    await resetLog()
    await begin()
    await finish(); await phase('gap', 1); await phase('playing', 1)
    await finish(); await phase('gap', 2)
    await controls.getByRole('button', { name:'停止练习', exact:true }).click()
    await phase('idle')
    await pauseNoRestart(2)
    assert.equal(await page.locator('.desktop-range-selected').count(), 2)

    await page.getByLabel('选段练习方式', { exact:true }).selectOption('recall')
    await resetLog(); await begin(); await finish(); await phase('recall', 1)
    await pauseNoRestart(1)
    await page.screenshot({ path:path.join(evidence, 'range-practice-recall.png') })
    await controls.getByRole('button', { name:'我读完了，再听一次', exact:true }).click()
    await phase('playing', 1)
    await finish(); await phase('complete', 2)
    assert.equal((await starts()).length, 2)

    // A replay starts a new count and invalidates the old waiting callback.
    await configure(3)
    await resetLog(); await begin(); await finish(); await phase('gap', 1)
    await controls.getByRole('button', { name:'重播选中片段', exact:true }).click()
    await phase('playing', 0)
    assert.equal((await starts()).length, 2)
    await controls.getByRole('button', { name:'停止练习', exact:true }).click()
    await pauseNoRestart(2)

    await resetLog(); await begin(); await finish(); await phase('gap', 1)
    await controls.getByRole('button', { name:'取消歌词多选', exact:true }).click()
    await controls.waitFor({ state:'detached' })
    await pauseNoRestart(1)

    await select(); await configure(3); await resetLog(); await begin(); await finish(); await phase('gap', 1)
    await page.locator('.desktop-recent button').filter({ hasText:'ひとこと練習' }).click()
    await pauseNoRestart(1)
    await page.locator('.desktop-recent button').filter({ hasText:'Windows便携测试' }).click()
    await page.waitForFunction(() => document.querySelector('audio').readyState >= 1)

    await select(); await configure(3); await resetLog(); await begin(); await finish(); await phase('gap', 1)
    await page.getByLabel('播放进度', { exact:true }).fill('2.5')
    await phase('idle')
    await pauseNoRestart(1)

    await resetLog(); await begin(); await finish(); await phase('gap', 1)
    await page.getByRole('button', { name:'播放第 3 句', exact:true }).click()
    await page.getByRole('button', { name:'暂停第 3 句', exact:true }).waitFor()
    assert.equal((await starts()).at(-1).time, 1.5)
    await page.getByRole('button', { name:'暂停第 3 句', exact:true }).click()
    await pauseNoRestart(2)

    // EOF and a late duplicate ended event must not cancel a subsequent pass.
    await select(3, 3); await configure(3); await resetLog(); await begin()
    for (let completed = 1; completed <= 3; completed++) {
      await finish(6, true)
      await phase(completed === 3 ? 'complete' : 'gap', completed)
      if (completed < 3) await phase('playing', completed)
    }
    assert.equal((await starts()).length, 3)
    assert.ok((await starts()).every(call => call.time === 4))

    await configure(3, '2')
    await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1024, 768))
    await page.waitForTimeout(200)
    const bounds = await page.evaluate(() => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      controls:document.querySelector('.desktop-lyric-range-controls').getBoundingClientRect().toJSON(),
      panel:document.querySelector('.lyrics-panel').getBoundingClientRect().toJSON() }))
    assert.ok(bounds.scrollWidth <= bounds.width && bounds.controls.right <= bounds.panel.right)
    await page.screenshot({ path:path.join(evidence, 'range-practice-small-window.png') })
    await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960))
    await controls.getByRole('button', { name:'取消歌词多选', exact:true }).click()
    await rows.first().locator('.line-number').click()
    await page.getByLabel('歌曲播放速度', { exact:true }).selectOption('0.5')
    await page.waitForFunction(() => {
      const value = JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).rangePracticeSettings
      return value.mode === 'repeat' && value.repeatCount === 3 && value.gapSeconds === 2
    })
    return ['range-repeat-three-five-and-infinite', 'range-gap-pause-resume-main-player', 'range-recall-manual-second-listen',
      'range-stop-replay-cancel-song-seek-cleanup', 'range-eof-repeat-and-exact-cues', 'range-practice-small-window']
  } finally {
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = window.__practiceOriginalPlay
      delete window.__practiceOriginalPlay
    }).catch(() => {})
  }
}
