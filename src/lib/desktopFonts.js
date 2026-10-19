export const DEFAULT_DESKTOP_FONT = 'yan-zhen-qing'
const SYSTEM_STACK = '"Segoe UI","Microsoft YaHei UI","Yu Gothic UI","Meiryo",sans-serif'

const single = (id, name, family) => ({ id, name, fonts: [{ id, name: '常规', family }] })
export const DESKTOP_FONT_GROUPS = [
  single('yan-zhen-qing', '颜真卿多宝塔碑（当前默认）', 'UTA YanZhenQing'),
  single('system', '系统默认', null),
  single('kinghwa-old-song', '京华老宋体', 'UTA KingHwa OldSong'),
  single('koku-mincho', '刻明朝', 'UTA Koku Mincho'),
  { id: 'source-han-serif', name: '思源宋体', fonts: [
    { id: 'source-han-regular', name: '常规 · Regular', family: 'UTA SourceHan Regular' },
    { id: 'source-han-extralight', name: '极细 · ExtraLight', family: 'UTA SourceHan Extralight' },
    { id: 'source-han-light', name: '细体 · Light', family: 'UTA SourceHan Light' },
    { id: 'source-han-medium', name: '中等 · Medium', family: 'UTA SourceHan Medium' },
    { id: 'source-han-semibold', name: '半粗 · SemiBold', family: 'UTA SourceHan Semibold' },
    { id: 'source-han-bold', name: '粗体 · Bold', family: 'UTA SourceHan Bold' },
    { id: 'source-han-heavy', name: '特粗 · Heavy', family: 'UTA SourceHan Heavy' },
    { id: 'source-han-sc-heavy', name: '简体特粗 · SC Heavy', family: 'UTA SourceHan SC Heavy' },
  ] },
  single('aidian-fengyahei', '爱点风雅黑', 'UTA Aidian FengYaHei'),
  single('maoken-zhuyuan', '猫啃珠圆体', 'UTA Maoken Zhuyuan'),
  single('flyflower-song', '飞花宋体', 'UTA FlyFlower Song'),
]
export const DESKTOP_FONTS = DESKTOP_FONT_GROUPS.flatMap(group => group.fonts.map(font => ({ ...font, groupId: group.id, groupName: group.name })))
export const DESKTOP_FONT_IDS = DESKTOP_FONTS.map(font => font.id)

export function normalizeDesktopFont(value) {
  return DESKTOP_FONT_IDS.includes(value) ? value : DEFAULT_DESKTOP_FONT
}
export function desktopFont(value) {
  return DESKTOP_FONTS.find(font => font.id === normalizeDesktopFont(value))
}
export function desktopFontFamily(value) {
  const font = desktopFont(value)
  return font.family ? `"${font.family}",${SYSTEM_STACK}` : SYSTEM_STACK
}
export function applyDesktopFont(value, element = document.documentElement) {
  const font = desktopFont(value)
  element.style.setProperty('--desktop-font-family', desktopFontFamily(font.id))
  // Keep the established default Latin typeface; all selectable alternatives
  // use the same font in both learning and sing-along pronunciation rows.
  element.style.setProperty('--desktop-romaji-font', font.id === DEFAULT_DESKTOP_FONT ? '"Segoe UI",Arial,sans-serif' : desktopFontFamily(font.id))
  element.dataset.utaFont = font.id
}
