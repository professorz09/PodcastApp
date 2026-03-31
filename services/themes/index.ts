import { Theme } from './types';
import { modernTheme } from './modern';
import { modernAltTheme } from './modern-alt';
import { transparentAvatarsTheme } from './transparent-avatars';
import { broadcastTheme } from './broadcast';
import { neonTheme } from './neon';
import { minimalTheme } from './minimal';
import { splitTheme } from './split';
import { arenaTheme } from './arena';

export const themes: Record<string, Theme> = {
  modern: modernTheme,
  'modern-alt': modernAltTheme,
  'transparent-avatars': transparentAvatarsTheme,
  broadcast: broadcastTheme,
  neon: neonTheme,
  minimal: minimalTheme,
  split: splitTheme,
  arena: arenaTheme,
};

export const getTheme = (id: string): Theme => {
  return themes[id] || themes['transparent-avatars'];
};

export const getThemeProperties = (id: string) => {
  return getTheme(id).properties;
};

export const getDefaultThemeConfig = (id: string) => {
  const theme = getTheme(id);
  const config: any = {};
  theme.properties.forEach(p => {
    config[p.id] = p.defaultValue;
  });
  return config;
};
