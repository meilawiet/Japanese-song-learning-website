import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_APPEARANCE, THEMES, normalizeAppearance, readAppearance, themeColor } from '../src/lib/appearance.js'

// 用户输入损坏或越界时仍可启动，避免错误外观设置影响已有学习数据。
test('外观设置具有四套主题与受限的独立字号', () => {
  assert.equal(THEMES.length, 4)
  assert.deepEqual(normalizeAppearance(), DEFAULT_APPEARANCE)
  assert.deepEqual(normalizeAppearance({theme:'invalid',textSize:-1,lyricSize:1000}),{theme:'garden',textSize:80,lyricSize:160})
  assert.deepEqual(normalizeAppearance({theme:'sea',textSize:113,lyricSize:'NaN'}),{theme:'sea',textSize:115,lyricSize:100})
})
test('外观颜色保留错误红色及透明度，正文与纸面随主题变化', () => {
  assert.equal(themeColor(192,57,50,1,205),'rgba(192,57,50,1)')
  // 透明度在生成样式中规范化为 0.5。
  assert.match(themeColor(66,101,80,.5,205),/^hsla\(205,.*,0\.5\)$/)
  assert.match(themeColor(255,253,248,1,270),/^hsla\(270,/)
})
test('本机设置恢复且损坏数据回退默认外观', () => {
  const original=globalThis.localStorage
  try {
    globalThis.localStorage={getItem:()=>'{invalid'}
    assert.deepEqual(readAppearance(),DEFAULT_APPEARANCE)
    globalThis.localStorage={getItem:()=>JSON.stringify({theme:'moon',textSize:120,lyricSize:140})}
    assert.deepEqual(readAppearance(),{theme:'moon',textSize:120,lyricSize:140})
  } finally {globalThis.localStorage=original}
})

// 四种角色配色都要满足实际阅读需求，黄色主题不能用亮黄色承载白色按钮文字。
test('角色主题保持按钮白字和正文的足够对比度', () => {
  const luminance = hex => {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
  }
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05)
  for (const theme of THEMES) {
    assert.ok(contrast(theme.colors[1],'#ffffff') >= 4.5, `${theme.name}按钮白字应清晰`)
    assert.ok(contrast(theme.ink,theme.colors[0]) >= 7, `${theme.name}正文应清晰`)
    assert.equal(themeColor(192,57,50,1,theme.hue,false,theme),'rgba(192,57,50,1)')
  }
})
