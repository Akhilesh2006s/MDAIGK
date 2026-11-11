import { COLORS } from '@mango/shared';

/** Chart palette built from brand tokens (green first, mango, gold, then supporting hues). */
export const CHART = {
  primary: COLORS.forestGreen,
  secondary: COLORS.mangoYellow,
  gold: COLORS.premiumGold,
  info: COLORS.info,
  muted: COLORS.locked,
  grid: COLORS.border,
  text: COLORS.textMuted,
  series: [COLORS.forestGreen, COLORS.premiumGold, COLORS.info, '#7A9A3A', '#B5651D', COLORS.locked],
};

export const axisProps = {
  tick: { fill: COLORS.textMuted, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: COLORS.border },
} as const;

export const tooltipProps = {
  contentStyle: { borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13 },
  cursor: { fill: 'rgba(20, 92, 56, 0.06)' },
} as const;

export const pctTick = (v: number) => `${v}%`;
