export type AppTheme =
  | 'light'
  | 'dark'
  | 'light-gradient'
  | 'dark-gradient'
  | 'chaos'
  | 'wave-onedark'
  | 'wave-dracula'
  | 'wave-monokai'
  | 'wave-campbell'
  | 'wave-warmyellow'
  | 'wave-rosepine'
  | 'wave-bg-rainbow'
  | 'wave-bg-ocean'
  | 'wave-bg-aqua'
  | 'wave-bg-sunset'
  | 'wave-bg-enchanted'
  | 'wave-bg-twilight'
  | 'wave-bg-dusk'
  | 'wave-bg-tropical'
  | 'wave-bg-ember'
  | 'wave-bg-cosmic';

export const STORAGE_KEY = 'hiveryn-theme';

const LIGHT_THEMES: AppTheme[] = ['light', 'light-gradient'];

export const VALID_THEMES: AppTheme[] = [
  'light', 'dark', 'light-gradient', 'dark-gradient',
  'chaos', 'wave-onedark', 'wave-dracula', 'wave-monokai',
  'wave-campbell', 'wave-warmyellow', 'wave-rosepine',
  'wave-bg-rainbow', 'wave-bg-ocean', 'wave-bg-aqua', 'wave-bg-sunset',
  'wave-bg-enchanted', 'wave-bg-twilight', 'wave-bg-dusk',
  'wave-bg-tropical', 'wave-bg-ember', 'wave-bg-cosmic',
];

export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', !LIGHT_THEMES.includes(theme));
  localStorage.setItem(STORAGE_KEY, theme);
}

export function readStoredTheme(): AppTheme | null {
  const stored = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
  return stored && VALID_THEMES.includes(stored) ? stored : null;
}

export type ThemeGroup = 'flat' | 'gradient' | 'terminal' | 'background';

export interface ThemeMeta {
  value: AppTheme;
  label: string;
  swatch: string;
  group: ThemeGroup;
}

export const THEME_GROUPS: Record<ThemeGroup, string> = {
  flat:       'Flat',
  gradient:   'Gradient',
  terminal:   'Wave Terminals',
  background: 'Wave Backgrounds',
};

export const THEMES: ThemeMeta[] = [
  { value: 'light',          label: 'Light',               swatch: '#fafafa',                                                                 group: 'flat' },
  { value: 'dark',           label: 'Dark',                swatch: '#000000',                                                                 group: 'flat' },
  { value: 'light-gradient', label: 'Glow',                swatch: 'linear-gradient(135deg,#f0f4ff,#faf5ff,#fff1f2)',                          group: 'gradient' },
  { value: 'dark-gradient',  label: 'Night',               swatch: 'linear-gradient(135deg,#0c0a1d,#1a1030,#0f172a)',                          group: 'gradient' },
  { value: 'chaos',          label: 'Wave',                swatch: '#58c142',                                                                 group: 'terminal' },
  { value: 'wave-onedark',   label: 'One Dark Pro',        swatch: '#61AFEF',                                                                 group: 'terminal' },
  { value: 'wave-dracula',   label: 'Dracula',             swatch: '#BD93F9',                                                                 group: 'terminal' },
  { value: 'wave-monokai',   label: 'Monokai',             swatch: '#A6E22E',                                                                 group: 'terminal' },
  { value: 'wave-campbell',  label: 'Campbell',            swatch: '#3B78FF',                                                                 group: 'terminal' },
  { value: 'wave-warmyellow',label: 'Warm Yellow',         swatch: '#F9D784',                                                                 group: 'terminal' },
  { value: 'wave-rosepine',  label: 'Rose Pine',           swatch: '#c4a7e7',                                                                 group: 'terminal' },
  { value: 'wave-bg-rainbow',   label: 'Rainbow',          swatch: 'linear-gradient(90deg,#ff1a01,#ffee00,#22da01,#008dfe,#713fff)',           group: 'background' },
  { value: 'wave-bg-ocean',     label: 'Ocean Depths',     swatch: 'linear-gradient(135deg,#6a0dad,#0000ff,#008080)',                          group: 'background' },
  { value: 'wave-bg-aqua',      label: 'Aqua Horizon',     swatch: 'linear-gradient(135deg,#0f1e32,#28527a,#00bcd4)',                          group: 'background' },
  { value: 'wave-bg-sunset',    label: 'Sunset',           swatch: 'linear-gradient(135deg,#800000,#ff4500,#4b0082)',                          group: 'background' },
  { value: 'wave-bg-enchanted', label: 'Enchanted Forest', swatch: 'linear-gradient(145deg,#003200,#228b22,#00c864)',                          group: 'background' },
  { value: 'wave-bg-twilight',  label: 'Twilight Mist',    swatch: 'linear-gradient(180deg,#3c3c5a,#5a6e8c,#787888)',                          group: 'background' },
  { value: 'wave-bg-dusk',      label: 'Dusk Horizon',     swatch: 'linear-gradient(0deg,#800000,#cc5500,#ff8c00,#3c3c78)',                    group: 'background' },
  { value: 'wave-bg-tropical',  label: 'Tropical Radiance',swatch: 'linear-gradient(135deg,#cc33ff,#ff3399,#3366ff)',                         group: 'background' },
  { value: 'wave-bg-ember',     label: 'Twilight Ember',   swatch: 'linear-gradient(120deg,#c45540,#b87a40,#3a5fa0)',                          group: 'background' },
  { value: 'wave-bg-cosmic',    label: 'Cosmic Tide',      swatch: 'linear-gradient(135deg,#00d9d9,#ff55aa,#1e1e2f)',                          group: 'background' },
];
