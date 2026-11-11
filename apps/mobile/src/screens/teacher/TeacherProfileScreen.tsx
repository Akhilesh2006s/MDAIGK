import React from 'react';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, Divider, IconCircle, ListRow, Muted, Row, Screen, SectionTitle } from '../../components/ui';
import type { TeacherTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';

export default function TeacherProfileScreen({ navigation }: TeacherTabScreen<'Profile'>) {
  const { user, activeSchool, signOut, switchSchool } = useAuth();
  const confirmLogout = () =>
    Alert.alert('Sign out?', 'You will need your email and password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <Screen>
      <Card>
        <Row gap={spacing.md}>
          <IconCircle icon="person" size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSizes.xl, fontWeight: '800', color: colors.text }}>{user?.name}</Text>
            <Muted>{user?.email}</Muted>
            <Muted>Teacher</Muted>
          </View>
        </Row>
      </Card>

      <SectionTitle>School</SectionTitle>
      <Card>
        <ListRow title={activeSchool?.schoolName ?? '—'} subtitle={activeSchool ? `School code ${activeSchool.schoolCode}` : undefined} left={<IconCircle icon="school-outline" />} chevron={false} />
        {(user?.schools.length ?? 0) > 1 ? (
          <>
            <Divider />
            <ListRow title="Switch school" subtitle={`${user?.schools.length} schools`} left={<IconCircle icon="swap-horizontal-outline" />} onPress={switchSchool} />
          </>
        ) : null}
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card>
        <ListRow title="Change password" left={<IconCircle icon="key-outline" />} onPress={() => navigation.navigate('ChangePassword')} />
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmLogout} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
