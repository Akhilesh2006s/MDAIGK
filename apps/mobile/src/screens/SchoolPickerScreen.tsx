import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, IconCircle, ListRow, Screen } from '../components/ui';
import { colors, fontSizes, spacing } from '../theme';

export default function SchoolPickerScreen() {
  const { user, selectSchool, signOut, schoolId } = useAuth();
  const schools = user?.schools ?? [];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <Screen>
        <View style={styles.head}>
          <Text style={styles.title}>Choose your school</Text>
          <Text style={styles.sub}>Hi {user?.name ?? ''}, you teach at more than one school. Pick the one you want to work in now. You can switch later from your profile.</Text>
        </View>
        {schools.length === 0 ? (
          <EmptyState icon="business-outline" title="No active school" message="Your account isn’t linked to an active school. Please contact your school administrator." />
        ) : (
          schools.map((s) => (
            <Card key={s.schoolId} onPress={() => selectSchool(s.schoolId)} accessibilityLabel={`Select ${s.schoolName}`}>
              <ListRow
                title={s.schoolName}
                subtitle={`School code ${s.schoolCode}${s.schoolId === schoolId ? ' · current' : ''}`}
                left={<IconCircle icon="school-outline" />}
                chevron
              />
            </Card>
          ))
        )}
        <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={() => signOut()} style={{ marginTop: spacing.lg }} />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.lg },
  title: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.forestGreen },
  sub: { fontSize: fontSizes.md, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
});
