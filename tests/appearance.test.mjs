import assert from 'node:assert/strict'
import test from 'node:test'
// 原导入不含字体清单：import { DEFAULT_APPEARANCE, THEMES, normalizeAppearance, readAppearance, themeColor } from '../src/lib/appearance.js'
// 原单层字体清单导入：import { DEFAULT_APPEARANCE, FONTS, THEMES, applyAppearance, normalizeAppearance, readAppearance, themeColor } from '../src/lib/appearance.js'
import { DEFAULT_APPEARANCE, FONTS, SOURCE_HAN_WEIGHTS, THEMES, applyAppearance, normalizeAppearance, readAppearance, themeColor } from '../src/lib/appearance.js'

// 用户输入损坏或越界时仍可启动，避免错误外观设置影响已有学习数据。
test('外观设置具有四套主题与受限的独立字号', () => {
  assert.equal(THEMES.length, 4)
  // 原断言检查14个平铺选项；主列表仍为六种，思源宋体第二层恢复八档。
  // assert.equal(FONTS.length, 14)
  assert.deepEqual(FONTS.map(font => font.id), ['yan', 'flyflower', 'maoken', 'aidian', 'kinghwa', 'sourcehan'])
  assert.deepEqual(SOURCE_HAN_WEIGHTS.map(font => font.id), ['sourcehan_extralight', 'sourcehan_light', 'sourcehan', 'sourcehan_medium', 'sourcehan_semibold', 'sourcehan_bold', 'sourcehan_heavy', 'sourcehan_sc_heavy'])
  assert.deepEqual(normalizeAppearance(), DEFAULT_APPEARANCE)
  // 原断言缺少字体字段；新增字段不改变字号和主题的既有边界。
  // assert.deepEqual(normalizeAppearance({theme:'invalid',textSize:-1,lyricSize:1000}),{theme:'garden',textSize:80,lyricSize:160})
  assert.deepEqual(normalizeAppearance({theme:'invalid',font:'unknown',textSize:-1,lyricSize:1000}),{theme:'garden',font:'yan',textSize:80,lyricSize:160})
  // assert.deepEqual(normalizeAppearance({theme:'sea',textSize:113,lyricSize:'NaN'}),{theme:'sea',textSize:115,lyricSize:100})
  assert.deepEqual(normalizeAppearance({theme:'sea',font:'maoken',textSize:113,lyricSize:'NaN'}),{theme:'sea',font:'maoken',textSize:115,lyricSize:100})
  assert.equal(normalizeAppearance({font:'sourcehan'}).font, 'sourcehan')
  // 旧刻明朝仍回退，恢复的思源字重保留原选择值。
  assert.equal(normalizeAppearance({font:'koku'}).font, 'yan')
  for (const font of ['sourcehan_extralight', 'sourcehan_semibold', 'sourcehan_heavy', 'sourcehan_sc_heavy']) assert.equal(normalizeAppearance({font}).font, font)
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
    // 旧版本机记录没有字体字段，仍以颜真卿显示。
    // assert.deepEqual(readAppearance(),{theme:'moon',textSize:120,lyricSize:140})
    assert.deepEqual(readAppearance(),{theme:'moon',font:'yan',textSize:120,lyricSize:140})
  } finally {globalThis.localStorage=original}
})

// 动态主题样式必须保留已限定安卓根节点的字体选择器，否则后置样式会覆盖选择结果。
test('字体切换保留安卓根节点选择器并写入当前字体', () => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  try {
    const declaration = ['--uta-selected-font']
    declaration.getPropertyValue = property => property === '--uta-selected-font' ? '"UTA Maoken"' : ''
    const output = { textContent: '' }
    globalThis.document = {
      getElementById: () => output,
      styleSheets: [{ ownerNode: {}, cssRules: [{ type: 1, selectorText: ':root.uta-android-font[data-uta-font="maoken"]', style: declaration }] }],
      documentElement: { dataset: {} },
    }
    globalThis.window = { dispatchEvent() {} }
    applyAppearance({ font: 'maoken' })
    assert.match(output.textContent, /:root\.uta-android-font\[data-uta-font="maoken"\]\{--uta-selected-font:"UTA Maoken"\}/)
    assert.doesNotMatch(output.textContent, /:root:root/)
    assert.equal(globalThis.document.documentElement.dataset.utaFont, 'maoken')
  } finally {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
  }
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
