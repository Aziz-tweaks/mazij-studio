export interface ThemeVars {
  '--bg': string; '--surface': string; '--surface2': string; '--line': string; '--text': string;
  '--muted': string; '--accent': string; '--onAccent': string; '--accentSoft': string; '--canvas': string;
  '--r': string; '--rs': string; '--gap': string; '--pad': string; '--shadow': string; '--overlay': string;
  '--font': string;
}

export interface Theme {
  vars: ThemeVars;
  floating: boolean;
  accent: string;
}

// "island" is the only visual direction wired up in Phase 1 — it is the one
// shown in design-source/reference-render.png. obsidian/paper existed as
// editor-only props in the prototype (no in-app switch), so they are not
// ported until a theme switcher is actually built.
export const ISLAND_THEME: Theme = {
  vars: {
    '--bg': '#E9ECF1',
    '--surface': '#FFFFFF',
    '--surface2': '#F1F3F7',
    '--line': 'rgba(16,24,40,.09)',
    '--text': '#0F172A',
    '--muted': '#64748B',
    '--accent': '#0EA5E9',
    '--onAccent': '#06202F',
    '--accentSoft': 'rgba(14,165,233,.14)',
    '--canvas': '#DDE2EA',
    '--r': '16px',
    '--rs': '10px',
    '--gap': '10px',
    '--pad': '0 10px 10px',
    '--shadow': '0 10px 30px rgba(15,23,42,.07)',
    '--overlay': 'rgba(15,23,42,.38)',
    '--font': "'Readex Pro', system-ui, sans-serif",
  },
  floating: true,
  accent: '#0EA5E9',
};
