// ProCabinet.App — Instagram carousel design tokens.
// Pulled straight from styles.css / brand/README.md so the slides match the
// live app exactly. Fresh, self-contained — shares nothing with remotion/.

export const C = {
  // brand — `accent` reads the --pc-accent CSS var (set per composition from
  // the editable `accent` prop) so it can be retuned live in Remotion Studio.
  accent: 'var(--pc-accent, #e8a838)',
  accentDim: 'rgba(232,168,56,0.13)',
  accentSoft: '#fbf1da',
  ink: '#111111',
  ink2: '#1c1c1c',

  // light surfaces (the app runs in light theme)
  bg: '#f2f2f2',
  surface: '#ffffff',
  surface2: '#f7f7f7',
  border: '#e3e3e3',
  borderSoft: '#ededed',

  // text
  text: '#111111',
  text2: '#444444',
  muted: '#8a8a8a',
  faint: '#b4b4b4',

  // chrome
  tabbar: '#e2e2e2',

  // semantic
  teal: '#0d9488',
  green: '#3d9970',
  greenDim: '#e6f2ec',
  blue: '#2f6fd0',
  blueDim: '#e7eefb',
  red: '#e05252',
  redDim: '#fbe9e9',
  amber: '#e8a838',
  amberDim: '#fbf0d8',
  greyDim: '#ececec',

  white: '#ffffff',
} as const;

// page geometry — Instagram 4:5 portrait carousel
export const W = 1080;
export const H = 1350;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  window: 22,
} as const;

export const SHADOW = {
  card: '0 1px 3px rgba(17,17,17,0.06), 0 8px 24px rgba(17,17,17,0.05)',
  window: '0 30px 80px rgba(17,17,17,0.22), 0 8px 24px rgba(17,17,17,0.10)',
  lift: '0 18px 50px rgba(17,17,17,0.16)',
  amber: '0 14px 40px rgba(232,168,56,0.40)',
} as const;
