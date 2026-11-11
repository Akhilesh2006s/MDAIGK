import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { endpoints } from '../../api';
import { Async, Badge, Button, Card, IconCircle, Ionicons, Muted, ProgressBar, Row, Screen, SectionTitle, type IconName } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentTabScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { avatarEmoji } from '../../utils/format';

export const SUBJECT_ICONS: Record<string, IconName> = {
  'book-open': 'book-outline',
  calculator: 'calculator-outline',
  flask: 'flask-outline',
  cpu: 'hardware-chip-outline',
  trophy: 'trophy-outline',
  globe: 'globe-outline',
};
export const subjectIcon = (icon?: string): IconName => (icon && SUBJECT_ICONS[icon]) || 'book-outline';

export default function StudentHomeScreen({ navigation }: StudentTabScreen<'Home'>) {
  const state = useApi(endpoints.studentHome, [], { reloadOnFocus: true });

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state} loadingLabel="Getting your day ready…">
        {(h) => {
          const dp = h.dailyProgress;
          const doneToday = dp.quizzes + dp.learningItems + dp.games;
          const goalPct = Math.min(100, (doneToday / Math.max(1, dp.dailyGoal)) * 100);
          const quick: Array<{ label: string; icon: IconName; onPress: () => void }> = [
            { label: 'News & GK', icon: 'newspaper-outline', onPress: () => navigation.navigate('News') },
            { label: 'Games', icon: 'game-controller-outline', onPress: () => navigation.navigate('Games') },
            { label: 'Certificates', icon: 'ribbon-outline', onPress: () => navigation.navigate('Certificates') },
            { label: 'My Progress', icon: 'stats-chart-outline', onPress: () => navigation.navigate('Progress') },
            { label: 'Programmes', icon: 'rocket-outline', onPress: () => navigation.navigate('Programmes') },
            { label: 'Activities', icon: 'clipboard-outline', onPress: () => navigation.navigate('MyActivities') },
          ];
          return (
            <>
              <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Open my profile" style={styles.hero}>
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 34 }}>{avatarEmoji(h.student.avatar)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.welcome}>Welcome back,</Text>
                  <Text style={styles.name}>{h.student.displayName || h.student.name}</Text>
                  <Text style={styles.cls}>
                    {h.student.className} · {h.student.schoolName}
                  </Text>
                </View>
                <Ionicons name="settings-outline" size={22} color={colors.lightGreen} />
              </Pressable>

              <Row gap={spacing.sm} style={{ alignItems: 'stretch', marginBottom: spacing.md }}>
                <Card style={[styles.mini, { backgroundColor: '#FFF4CC' }]}>
                  <Ionicons name="flame" size={22} color="#E07B00" />
                  <Text style={styles.miniValue}>{h.streak.current}</Text>
                  <Muted>day streak{h.streak.activeToday ? ' · today ✓' : ''}</Muted>
                </Card>
                <Card style={[styles.mini, { backgroundColor: colors.goldBg }]} onPress={() => navigation.navigate('Certificates')} accessibilityLabel="Certification level">
                  <Ionicons name="ribbon" size={22} color={colors.gold} />
                  <Text style={styles.miniValue}>{h.certification.currentLevel ? `Level ${h.certification.currentLevel}` : 'Start'}</Text>
                  <Muted>{h.certification.currentLevel ? `${h.certification.certificates} certificate${h.certification.certificates === 1 ? '' : 's'}` : 'Get certified'}</Muted>
                </Card>
              </Row>

              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={styles.cardTitle}>Today’s progress</Text>
                  <Badge label={doneToday >= dp.dailyGoal ? 'Goal reached!' : `${doneToday}/${dp.dailyGoal}`} tone={doneToday >= dp.dailyGoal ? 'success' : 'yellow'} />
                </Row>
                <ProgressBar value={goalPct} color={colors.mangoYellow} height={12} style={{ marginVertical: spacing.sm }} />
                <Row style={{ justifyContent: 'space-around' }}>
                  <Stat icon="help-circle-outline" value={dp.quizzes} label="Quizzes" />
                  <Stat icon="book-outline" value={dp.learningItems} label="Learning" />
                  <Stat icon="game-controller-outline" value={dp.games} label="Games" />
                </Row>
              </Card>

              {h.pendingActivities > 0 ? (
                <Card onPress={() => navigation.navigate('MyActivities')} style={{ backgroundColor: colors.lightGreen }} accessibilityLabel="Open my activities">
                  <Row>
                    <IconCircle icon="clipboard" bg={colors.white} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {h.pendingActivities} activit{h.pendingActivities === 1 ? 'y' : 'ies'} from your teacher
                      </Text>
                      <Muted>Tap to see what’s due</Muted>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </Row>
                </Card>
              ) : null}

              {h.continueLearning ? (
                <Card onPress={() => navigation.navigate('LearningItem', { id: h.continueLearning!.id, title: h.continueLearning!.title })} accessibilityLabel={`Continue ${h.continueLearning.title}`}>
                  <Muted>Continue learning</Muted>
                  <Text style={styles.cardTitle}>{h.continueLearning.title}</Text>
                  <Row style={{ marginTop: spacing.sm }}>
                    <ProgressBar value={h.continueLearning.progressPct} style={{ flex: 1 }} />
                    <Text style={{ fontWeight: '700', color: colors.primary }}>{Math.round(h.continueLearning.progressPct)}%</Text>
                  </Row>
                </Card>
              ) : null}

              <SectionTitle>Quick links</SectionTitle>
              <View style={styles.quickGrid}>
                {quick.map((q) => (
                  <Pressable key={q.label} onPress={q.onPress} accessibilityRole="button" accessibilityLabel={q.label} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}>
                    <Ionicons name={q.icon} size={26} color={colors.forestGreen} />
                    <Text style={styles.quickText}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle>My subjects</SectionTitle>
              <View style={styles.subjectGrid}>
                {h.subjects.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => navigation.navigate('Learn', { subjectId: s.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${s.progressPercent} percent complete`}
                    style={({ pressed }) => [styles.subject, pressed && { opacity: 0.7 }]}
                  >
                    <IconCircle icon={subjectIcon(s.icon)} />
                    <Text style={styles.subjectName} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <ProgressBar value={s.progressPercent} height={8} />
                    <Muted style={{ fontSize: fontSizes.xs }}>
                      {s.completedItems}/{s.totalItems} done
                    </Muted>
                  </Pressable>
                ))}
              </View>
              {h.subjects.length === 0 ? <Muted>No subjects are available for your class yet.</Muted> : null}
              <Button title="Explore all learning" variant="secondary" icon="library-outline" onPress={() => navigation.navigate('Learn')} style={{ marginTop: spacing.md }} />
            </>
          );
        }}
      </Async>
    </Screen>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.forestGreen, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.mangoYellow, alignItems: 'center', justifyContent: 'center' },
  welcome: { color: colors.lightGreen, fontSize: fontSizes.sm },
  name: { color: colors.white, fontSize: fontSizes.xl, fontWeight: '800' },
  cls: { color: colors.lightGreen, fontSize: fontSizes.sm, marginTop: 2 },
  mini: { flex: 1, marginBottom: 0, gap: 2 },
  miniValue: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.text },
  cardTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.text },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { width: '31.5%', minHeight: 84, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm },
  quickText: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  subject: { width: '48.5%', backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  subjectName: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text, minHeight: 40 },
});
