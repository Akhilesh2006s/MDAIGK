import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { colors, fontSizes, spacing } from '../theme';
import { ProgressBar } from './ui';

/** Horizontal percentage bars, e.g. subject-wise performance. Null values show "No data". */
export function BarList({ rows, color = colors.primary }: { rows: Array<{ label: string; value: number | null; sub?: string }>; color?: string }) {
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={`${r.label}: ${r.value === null ? 'no data' : `${Math.round(r.value)} percent`}`}>
          <View style={styles.barHead}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.barValue}>{r.value === null ? 'No data' : `${Math.round(r.value)}%`}</Text>
          </View>
          <ProgressBar value={r.value ?? 0} color={r.value === null ? colors.locked : r.value < 50 ? colors.mangoYellow : color} />
          {r.sub ? <Text style={styles.barSub}>{r.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Simple 0–100 line chart for weekly trends. */
export function LineChart({ points, height = 180 }: { points: Array<{ label: string; value: number }>; height?: number }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const x = (i: number) => padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityLabel={`Trend chart with ${points.length} points`}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0, 50, 100].map((g) => (
            <React.Fragment key={g}>
              <Line x1={padL} x2={width - padR} y1={y(g)} y2={y(g)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={padL - 6} y={y(g) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {String(g)}
              </SvgText>
            </React.Fragment>
          ))}
          {points.length > 1 ? (
            <Polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2.5} />
          ) : null}
          {points.map((p, i) => (
            <Circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.value)} r={4} fill={colors.mangoYellow} stroke={colors.primary} strokeWidth={1.5} />
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText key={`l-${p.label}-${i}`} x={x(i)} y={height - 8} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { flex: 1, fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
  barValue: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.text },
  barSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
});
