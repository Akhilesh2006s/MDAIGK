import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, shadow, spacing, TOUCH } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ------------------------------------------------------------------ layout
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (!scroll) return <View style={[styles.screen, styles.screenPad, style]}>{children}</View>;
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.screenPad, styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Row({ children, style, gap = spacing.sm }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ size = spacing.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

// ------------------------------------------------------------------ text
export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}
export function Body({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

// ------------------------------------------------------------------ card
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------------ buttons
type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'gold';
const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.text, border: colors.accent },
  gold: { bg: colors.gold, fg: colors.white, border: colors.gold },
  secondary: { bg: colors.white, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = BUTTON_COLORS[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: c.bg, borderColor: c.border },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <Row gap={spacing.sm} style={{ justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={c.fg} /> : null}
          <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: c.fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.primary }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={24} color={color} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ progress / badges
export function ProgressBar({ value, color = colors.primary, height = 10, style }: { value: number | null | undefined; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <View
      style={[styles.progressTrack, { height, borderRadius: height / 2 }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={{ width: `${pct}%`, backgroundColor: color, height: '100%', borderRadius: height / 2 }} />
    </View>
  );
}

type Tone = 'gold' | 'green' | 'yellow' | 'muted' | 'danger' | 'info' | 'success';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  gold: { bg: colors.goldBg, fg: '#8A6510' },
  green: { bg: colors.lightGreen, fg: colors.primary },
  yellow: { bg: '#FFF4CC', fg: '#7A5B00' },
  muted: { bg: '#EFEFEA', fg: colors.textMuted },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  success: { bg: colors.successBg, fg: colors.success },
};

export function Badge({ label, tone = 'green', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function PremiumBadge() {
  return <Badge label="Premium" tone="gold" icon="star" />;
}

// ------------------------------------------------------------------ states
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Muted style={{ marginTop: spacing.md }}>{label}</Muted>
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.stateBox}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Muted style={{ textAlign: 'center' }}>{message}</Muted> : null}
      {action ? <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const isNetwork = (error as { code?: string } | null)?.code === 'NETWORK_ERROR';
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  if (compact) {
    return (
      <View style={styles.banner} accessibilityRole="alert">
        <Ionicons name={isNetwork ? 'cloud-offline-outline' : 'alert-circle-outline'} size={18} color={colors.danger} />
        <Text style={styles.bannerText}>{message}</Text>
        {onRetry ? <Button title="Retry" variant="ghost" small onPress={onRetry} /> : null}
      </View>
    );
  }
  return (
    <View style={styles.stateBox} accessibilityRole="alert">
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerBg }]}>
        <Ionicons name={isNetwork ? 'cloud-offline-outline' : 'alert-circle-outline'} size={32} color={colors.danger} />
      </View>
      <Text style={styles.stateTitle}>{isNetwork ? 'You’re offline' : 'Something went wrong'}</Text>
      <Muted style={{ textAlign: 'center' }}>{message}</Muted>
      {onRetry ? <Button title="Try again" icon="refresh" onPress={onRetry} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function InfoBanner({ message, icon = 'information-circle-outline', tone = 'info' }: { message: string; icon?: IconName; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={18} color={t.fg} />
      <Text style={[styles.bannerText, { color: t.fg }]}>{message}</Text>
    </View>
  );
}

/**
 * Renders loading / error (with retry) / empty / content for a useApi() state.
 * When a refresh fails but data exists, the data stays and a compact banner shows.
 */
export function Async<T>({
  state,
  isEmpty,
  empty,
  children,
  loadingLabel,
}: {
  state: { data: T | null; error: unknown; loading: boolean; retry: () => void };
  isEmpty?: (data: T) => boolean;
  empty?: { icon?: IconName; title: string; message?: string; action?: React.ReactNode };
  children: (data: T) => React.ReactNode;
  loadingLabel?: string;
}) {
  if (state.loading && !state.data) return <Loading label={loadingLabel} />;
  if (!state.data) return <ErrorState error={state.error} onRetry={state.retry} />;
  return (
    <>
      {state.error ? <ErrorState compact error={state.error} onRetry={state.retry} /> : null}
      {isEmpty && isEmpty(state.data) && empty ? <EmptyState {...empty} /> : children(state.data)}
    </>
  );
}

// ------------------------------------------------------------------ inputs
export function TextField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.locked}
        accessibilityLabel={label}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, style]}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={14} color={colors.text} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
      {children}
    </ScrollView>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ data display
export function StatTile({ label, value, sub, icon, tone = 'green' }: { label: string; value: string | number; sub?: string; icon?: IconName; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.stat, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={20} color={t.fg} /> : null}
      <Text style={[styles.statValue, { color: t.fg }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron = Boolean(onPress),
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Muted numberOfLines={2}>{subtitle}</Muted> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={20} color={colors.locked} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function IconCircle({ icon, color = colors.primary, bg = colors.lightGreen, size = 40 }: { icon: IconName; color?: string; bg?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export { Ionicons };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenPad: { padding: spacing.lg },
  scrollContent: { paddingBottom: spacing.xxl * 2 },
  title: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.text },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  muted: { fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  button: { minHeight: TOUCH, borderRadius: radii.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 40, paddingHorizontal: spacing.md },
  buttonText: { fontSize: fontSizes.md, fontWeight: '700' },
  buttonTextSmall: { fontSize: fontSizes.sm },
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { backgroundColor: colors.progressTrack, overflow: 'hidden', width: '100%' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, minHeight: 240 },
  stateBox: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing.xl },
  stateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.lightGreen, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  stateTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md },
  bannerText: { flex: 1, color: colors.danger, fontSize: fontSizes.sm },
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: { minHeight: TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.md, color: colors.text, backgroundColor: colors.white },
  fieldError: { color: colors.danger, fontSize: fontSizes.xs, marginTop: spacing.xs },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: fontSizes.sm, color: colors.text, fontWeight: '600' },
  chipTextSelected: { color: colors.text },
  segmented: { flexDirection: 'row', backgroundColor: colors.lightGreen, borderRadius: radii.md, padding: 4, marginBottom: spacing.md },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.white, ...shadow },
  segmentText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.primary },
  stat: { flexGrow: 1, flexBasis: '45%', borderRadius: radii.lg, padding: spacing.md, gap: 2 },
  statValue: { fontSize: fontSizes.xl, fontWeight: '800' },
  statLabel: { fontSize: fontSizes.sm, color: colors.text, fontWeight: '600' },
  statSub: { fontSize: fontSizes.xs, color: colors.textMuted },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  rowTitle: { fontSize: fontSizes.md, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
});
