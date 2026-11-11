import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, radii, spacing } from '../theme';
import { IconButton } from './ui';

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Day-level date picker without a native dependency: ‹ Mon, 12 Nov 2026 › */
export function DateStepper({ label, value, onChange, min }: { label: string; value: Date; onChange: (d: Date) => void; min?: Date }) {
  const canGoBack = !min || startOfDay(addDays(value, -1)) >= startOfDay(min);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <IconButton icon="chevron-back" label={`${label}: previous day`} onPress={() => canGoBack && onChange(addDays(value, -1))} color={canGoBack ? colors.primary : colors.locked} />
        <Text style={styles.value} accessibilityLiveRegion="polite">
          {value.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
        <IconButton icon="chevron-forward" label={`${label}: next day`} onPress={() => onChange(addDays(value, 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white },
  value: { flex: 1, textAlign: 'center', fontSize: fontSizes.md, fontWeight: '600', color: colors.text },
});
