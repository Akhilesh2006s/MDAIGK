import { COLORS, FONT_SIZES, RADII, SPACING } from '@mango/shared';

export const colors = {
  ...COLORS,
  primary: COLORS.forestGreen,
  accent: COLORS.mangoYellow,
  gold: COLORS.premiumGold,
  background: COLORS.warmIvory,
  surface: COLORS.white,
  progressTrack: COLORS.lightGreen,
  success: '#2E7D4F',
  successBg: '#E3F4EA',
  goldBg: '#FBF1D3',
  infoBg: '#E6F0FA',
} as const;

export const spacing = SPACING;
export const radii = RADII;
export const fontSizes = FONT_SIZES;

/** Minimum touch target (dp). */
export const TOUCH = 48;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
