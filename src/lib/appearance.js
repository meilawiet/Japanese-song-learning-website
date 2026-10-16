import { customFontFamily, isCustomFont } from './customFonts.js'

// 外观只保存在本机；不改变歌词内容、人工读音或网页端的默认样式。
export const APPEARANCE_KEY = 'uta-appearance-v1'
export const THEMES = [
  // 原苔庭清晨为米色纸面：#f5f2eb / #426550 / #e0ebda；保留标识兼容已有设置。
  // 上一版白露新绿：hue 135，#f7faf7 / #426550 / #e0ebda。
  // 希露菲：翠绿与白色，正文用深绿灰；角色图片只作配色参考，不打包立绘。
  { id: 'garden', name: '白羽翠风', hue: 151, ink: '#243b32', colors: ['#f8fbf9', '#28634b', '#e2efe7'] },
  // 上一版晴海微蓝：hue 205，#f0f6fa / #315f86 / #dfeaf5。
  // 洛琪希：发色的靛蓝搭配魔法师服装的深蓝灰，避免偏亮的海水蓝。
  { id: 'sea', name: '星杖靛蓝', hue: 229, ink: '#2c3045', colors: ['#f8f9fc', '#414c84', '#e6e9f4'] },
  // 原配色保留对照：暮樱浅粉 hue 340，#fbf2f5 / #865067 / #f2dfe7。
  // 保留存储标识，已有选择自动迁移为暖红主题；浅底色避免大面积强红影响阅读。
  // 上一版晨曦暖红：hue 8，#faf3f1 / #a34c3e / #f0dfdb。
  // 爱丽丝：深绯红搭配衣装的白色与炭灰，降低原配色的橙粉感。
  { id: 'sakura', name: '绯剑赤霞', hue: 352, ink: '#402e33', colors: ['#fcf9f9', '#963d49', '#f3e4e6'] },
  // 原配色保留对照：月影淡紫 hue 270，#f5f2fa / #665080 / #e9dff2。
  // 金黄色主题用深棕金强调色，保持白色按钮文字的可读性。
  // 上一版蜜光浅金：hue 45，#faf7ef / #816b27 / #eee8d7。
  // 鲁迪：麦金发色、米白服装与旅行装备的棕色，深棕金按钮保证白字可读。
  { id: 'moon', name: '旅途麦金', hue: 39, ink: '#43372a', colors: ['#fcfaf6', '#806134', '#f0e8d9'] },
]
// 原默认设置：{ theme: 'garden', textSize: 100, lyricSize: 100 }；旧存储未含字体时继续选用颜真卿。
export const FONTS = [
  { id: 'yan', name: '颜真卿多宝塔碑' },
  { id: 'flyflower', name: '飞花宋体' },
  { id: 'maoken', name: '猫啃珠圆体' },
  { id: 'aidian', name: '爱点风雅黑' },
  { id: 'kinghwa', name: '京华老宋体' },
  // 思源宋体在主字体列表只占一项，粗细由下方独立选择框管理。
  { id: 'sourcehan', name: '思源宋体' },
]
export const SOURCE_HAN_WEIGHTS = [
  // 原仅保留细、常规、中、粗四档；远程字体仓库启用后恢复其余四档。
  { id: 'sourcehan_extralight', name: '极细' },
  { id: 'sourcehan_light', name: '细' },
  { id: 'sourcehan', name: '常规' },
  { id: 'sourcehan_medium', name: '中' },
  { id: 'sourcehan_semibold', name: '半粗' },
  { id: 'sourcehan_bold', name: '粗' },
  { id: 'sourcehan_heavy', name: '特粗（CN）' },
  { id: 'sourcehan_sc_heavy', name: '特粗（SC）' },
]
// 原迁移把四种停用字重归并到细/粗；如今恢复原标识，仅刻明朝继续回退原默认字体。
// sourcehan_extralight: 'sourcehan_light', sourcehan_semibold: 'sourcehan_bold', sourcehan_heavy: 'sourcehan_bold', sourcehan_sc_heavy: 'sourcehan_bold'
const LEGACY_FONT_MIGRATION = {
  koku: 'yan',
}
export const DEFAULT_APPEARANCE = { theme: 'garden', font: 'yan', textSize: 100, lyricSize: 100 }
export function normalizeAppearance(value = {}) {
  const size = (input, max) => Number.isFinite(Number(input)) ? Math.max(80, Math.min(max, Math.round(Number(input) / 5) * 5)) : 100
  // 原返回值不含 font；新增字段只接受内置字体标识，损坏或旧版设置回退原字体。
  // return { theme: THEMES.some(theme => theme.id === value.theme) ? value.theme : 'garden', textSize: size(value.textSize ?? 100, 130), lyricSize: size(value.lyricSize ?? 100, 160) }
  // 原规则只检查主字体列表：font: FONTS.some(font => font.id === value.font) ? value.font : 'yan'。
  const requestedFont = typeof value.font === 'string' ? value.font : ''
  const font = Object.hasOwn(LEGACY_FONT_MIGRATION, requestedFont) ? LEGACY_FONT_MIGRATION[requestedFont] : requestedFont
  // 原校验仅允许内置字体与思源字重；导入文件使用 SHA-256 标识，避免任意值注入字体变量。
  // const validFont = FONTS.some(item => item.id === font) || SOURCE_HAN_WEIGHTS.some(item => item.id === font)
  const validFont = FONTS.some(item => item.id === font) || SOURCE_HAN_WEIGHTS.some(item => item.id === font) || isCustomFont(font)
  return { theme: THEMES.some(theme => theme.id === value.theme) ? value.theme : 'garden', font: validFont ? font : 'yan', textSize: size(value.textSize ?? 100, 130), lyricSize: size(value.lyricSize ?? 100, 160) }
}
export function readAppearance() {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}')) } catch { return { ...DEFAULT_APPEARANCE } }
}

// 色彩保留原来的明度与透明度；错误红色、图片及高饱和装饰色不改写。
// 原签名不含角色配色；可选参数兼容旧调用与现有测试。
export function themeColor(red, green, blue, alpha, hue, semanticAccent = false, palette = null) {
  const rgb = [red, green, blue].map(value => Number(value) / 255)
  const max = Math.max(...rgb), min = Math.min(...rgb), light = (max + min) / 2, delta = max - min
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0
  let originalHue = 0
  if (delta) originalHue = ((max === rgb[0] ? (rgb[1] - rgb[2]) / delta : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4) * 60 + 360) % 360
  const greenTone = originalHue >= 70 && originalHue <= 185
  // 浅色纸面即使饱和度较高（如暖白色）也随主题调整。
  const paperTone = light > .9 || light > .88 && saturation < .85
  const neutralTone = saturation < .18 && light > .12
  // 跟唱与复习卡片原本使用暖黄色，属于主题强调色，应随主题改变。
  const warmAccent = semanticAccent && originalHue >= 20 && originalHue < 70
  if (!greenTone && !paperTone && !neutralTone && !warmAccent) return `rgba(${red},${green},${blue},${alpha})`
  // 角色主题分别定义白色纸面、浅色卡片、深色强调色，避免所有区域仅机械换色相。
  // 透明度沿用原声明，透明按钮、投影及图片均保持原有交互结构。
  if (palette) {
    const hex = light > .97 ? '#ffffff' : light > .94 ? palette.colors[0] : light > .87 ? palette.colors[2] : light < .20 ? palette.ink : light < .48 && saturation > .20 ? palette.colors[1] : null
    if (hex) return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`
  }
  return `hsla(${hue},${Math.round(Math.max(.12, Math.min(saturation, .5)) * 100)}%,${Math.round(light * 100)}%,${alpha})`
}

// 从当前样式声明生成安卓专用覆盖，兼容现有大量 px 字号与硬编码色值。
// 原样式完整保留；网页没有此覆盖，媒体查询与选中状态继续按原规则生效。
export function applyAppearance(value) {
  const appearance = normalizeAppearance(value)
  const theme = THEMES.find(item => item.id === appearance.theme)
  const scoped = selector => selector.split(',').map(part => {
    const text = part.trim()
    // 原替换规则会把已有 :root.uta-android-font 错写成 :root:root.uta-android-font，
    // 使外观覆盖中的安卓字体变量失效；根节点已限定安卓时直接保留。
    if (text.startsWith(':root.uta-android-font')) return text
    if (text.includes('.uta-android-font')) return text.replace(/\.uta-android-font/g, ':root.uta-android-font')
    if (/^(?:html|:root)(?=[\s.:#\[]|$)/.test(text)) return text.replace(/^(?:html|:root)/, ':root.uta-android-font')
    return `:root.uta-android-font ${text}`
  }).join(',')
  const build = rules => [...rules].map(rule => {
    if (rule.type === 4 || rule.type === 12) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${build(rule.cssRules)}}`
    if (!rule.selectorText || !rule.style) return ''
    const lyric = /\.japanese|\.android-sing-text|\.dual-line-reading|\.kana|\.lyric-token.*rt|\.line-reading|\.theme-preview|\.word-aligned-(?:kana|romaji|unresolved)/.test(rule.selectorText)
    const scale = appearance.textSize / 100 * (lyric ? appearance.lyricSize / 100 : 1)
    const declarations = []
    // 原规则仅处理入口卡片：const semanticAccent = /android-mode-(?:card|icon|action)/.test(rule.selectorText)
    // 设置齿轮与歌词解析也属于主题强调色，而非需要保留的警告颜色。
    const semanticAccent = /android-mode-(?:card|icon|action)|android-home-link-icon\.settings|sentence-explain-link|sentence-inline-analysis/.test(rule.selectorText)
    const fontSize = rule.style.getPropertyValue('font-size')
    // em 已继承父级字号，不重复缩放，避免小注音被放大两次。
    if (fontSize && /\d(?:px|rem)/.test(fontSize)) declarations.push(`font-size:${fontSize.replace(/(\d*\.?\d+)(px|rem)/g, (_, size, unit) => `calc(${size}${unit} * ${scale})`)}`)
    // 含字体变量的 font 简写在 CSSOM 中不能展开字号，需覆盖原简写。
    const shorthand = rule.style.getPropertyValue('font')
    if (!fontSize && shorthand && /\d(?:px|rem)/.test(shorthand)) declarations.push(`font:${shorthand.replace(/(\d*\.?\d+)(px|rem)/g, (_, size, unit) => `calc(${size}${unit} * ${scale})`)}`)
    // 原规则跳过 garden：if (theme.id !== 'garden')；绿色主题现在也统一转换米色纸面。
    for (const property of rule.style) {
      if (!/color|background|border|shadow|^--/.test(property)) continue
      const original = rule.style.getPropertyValue(property)
      // 浏览器 CSSOM 把普通色值规范化为 rgb；变量定义中的十六进制单独处理。
      const transformed = original.replace(/#([0-9a-f]{3,8})\b/gi, (match, hex) => {
        if (![3,4,6,8].includes(hex.length)) return match
        const full = hex.length < 5 ? [...hex].map(char => char + char).join('') : hex
        // 原转换只传 theme.hue 与 semanticAccent；现在同时传入角色的纸面与强调色。
        return themeColor(parseInt(full.slice(0,2),16),parseInt(full.slice(2,4),16),parseInt(full.slice(4,6),16),full.length === 8 ? parseInt(full.slice(6,8),16)/255 : 1,theme.hue,semanticAccent,theme)
      }).replace(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/g, (_,r,g,b,a) => themeColor(r,g,b,a ?? 1,theme.hue,semanticAccent,theme))
      // 原规则只复制变色声明：if (transformed !== original) declarations.push(`${property}:${transformed}`)
      // 同时复制透明底色、边框重置等声明，保证主题覆盖仍遵守原有层叠顺序。
      // 否则早期通用按钮底色获得更高权重，压过安卓页面后续的透明样式。
      declarations.push(`${property}:${transformed}`)
    }
    return declarations.length ? `${scoped(rule.selectorText)}{${declarations.join(';')}}` : ''
  }).join('\n')
  let style = document.getElementById('uta-appearance-style')
  if (!style) { style = document.createElement('style'); style.id = 'uta-appearance-style'; document.head.append(style) }
  style.textContent = [...document.styleSheets].filter(sheet => sheet.ownerNode !== style).map(sheet => {
    try { return build(sheet.cssRules) } catch { return '' }
  }).join('\n')
  document.documentElement.dataset.utaTheme = appearance.theme
  // 字体切换由安卓根节点控制；网页端没有该类名，继续使用原网页字体。
  document.documentElement.dataset.utaFont = appearance.font
  // 自定义字体的族名由本机文件摘要生成；CSS 仍统一通过 --uta-selected-font 作用于界面。
  if (isCustomFont(appearance.font)) document.documentElement.style?.setProperty('--uta-user-font-family', `"${customFontFamily(appearance.font)}"`)
  else document.documentElement.style?.removeProperty('--uta-user-font-family')
  // 正在跟唱的页面在文字大小改变后继续保持当前句居中。
  window.dispatchEvent(new Event('uta:appearance-changed'))
}
export function saveAppearance(value) {
  const normalized = normalizeAppearance(value)
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(normalized))
  applyAppearance(normalized)
  return normalized
}
