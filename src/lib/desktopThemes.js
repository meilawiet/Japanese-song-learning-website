// Theme values are also used by the settings swatches and the preview page.
export const DESKTOP_THEMES = [
  {
    id: 'white-feather', name: '白羽翠风', description: '柔白底色，松翠点缀',
    colors: { accent: '#286650', strong: '#20513f', soft: '#e2eee7', highlight: '#d4e7dc',
      bg: '#f6f9f6', surface: '#fcfdfb', chrome: '#eef4ef', border: '#d7e3d9',
      ink: '#263b32', muted: '#586f62', subtle: '#65766b', heading: '#354d40', shadow: '#233c3126' },
  },
  {
    id: 'star-indigo', name: '星杖靛蓝', description: '月白底色，静谧靛蓝',
    colors: { accent: '#444e85', strong: '#343d6c', soft: '#e8e8f4', highlight: '#dcdff0',
      bg: '#f7f7fb', surface: '#fdfdff', chrome: '#f0f0f8', border: '#dddfee',
      ink: '#30364b', muted: '#626881', subtle: '#70758b', heading: '#434965', shadow: '#2c315526' },
  },
  {
    id: 'crimson-blade', name: '绯剑赤霞', description: '雪白底色，温柔绯霞',
    colors: { accent: '#963e52', strong: '#7b2d40', soft: '#f3e4e8', highlight: '#edd4dc',
      bg: '#fbf7f8', surface: '#fffcfc', chrome: '#f7eff1', border: '#eadbe0',
      ink: '#49323a', muted: '#7b616c', subtle: '#826f79', heading: '#62434e', shadow: '#522b3626' },
  },
  {
    id: 'wheat-journey', name: '旅途麦金', description: '米白底色，暖调麦金',
    colors: { accent: '#806235', strong: '#664c27', soft: '#efe8d9', highlight: '#e7dcc6',
      bg: '#faf8f2', surface: '#fefdf8', chrome: '#f4f0e6', border: '#e4ddcd',
      ink: '#443b2d', muted: '#746752', subtle: '#80735f', heading: '#5b4b35', shadow: '#4b3d2826' },
  },
]

export const DEFAULT_DESKTOP_THEME = 'star-indigo'
export const DESKTOP_THEME_IDS = DESKTOP_THEMES.map(theme => theme.id)

export function normalizeDesktopTheme(value) {
  return DESKTOP_THEME_IDS.includes(value) ? value : DEFAULT_DESKTOP_THEME
}

export function applyDesktopTheme(value, element = document.documentElement, windowColors = null) {
  const theme = DESKTOP_THEMES.find(item => item.id === normalizeDesktopTheme(value))
  for (const [name, color] of Object.entries(theme.colors)) element.style.setProperty(`--desktop-${name}`, color)
  element.dataset.utaTheme = theme.id
  const desktop = globalThis.window?.utaDesktop
  if (desktop?.applyTheme) desktop.applyTheme(windowColors || { chrome: theme.colors.chrome, ink: theme.colors.ink, bg: theme.colors.bg })
    .catch(error => console.error('Window theme could not be applied', error))
}
