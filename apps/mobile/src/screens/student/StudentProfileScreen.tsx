import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { endpoints, errorMessage } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { Async, Button, Card, InfoBanner, InlineError, Muted, Row, Screen, SectionTitle, TextField } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { AVATARS } from '../../utils/format';

export default function StudentProfileScreen() {
  const { signOut } = useAuth();
  const state = useApi(endpoints.studentProfile);
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('mango');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.data) {
      setDisplayName(state.data.displayName ?? '');
      setAvatar(state.data.avatar && AVATARS[state.data.avatar] ? state.data.avatar : 'mango');
    }
  }, [state.data]);

  const dirty = state.data && (displayName.trim() !== (state.data.displayName ?? '') || avatar !== (state.data.avatar ?? 'mango'));

  async function save() {
    const name = displayName.trim();
    if (!name) return setError('Display name can’t be empty.');
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await endpoints.updateStudentProfile({ displayName: name, avatar });
      state.setData((d) => (d ? { ...d, displayName: name, avatar } : d));
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const confirmLogout = () =>
    Alert.alert('Sign out?', 'You’ll need your school code, student ID and PIN to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <Screen>
      <Async state={state}>
        {(p) => (
          <>
            <Card style={{ alignItems: 'center' }}>
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.mangoYellow, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 48 }}>{AVATARS[avatar]}</Text>
              </View>
              <Text style={{ fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, marginTop: spacing.sm }}>{p.displayName || p.name}</Text>
              <Muted>{p.name}</Muted>
              <Muted>
                Class {p.levelNumber}
                {p.section ? `-${p.section}` : ''} · {p.schoolName}
              </Muted>
              <Muted>Student ID {p.studentCode}</Muted>
            </Card>

            <SectionTitle>Edit my profile</SectionTitle>
            <TextField label="Display name" value={displayName} onChangeText={(t) => { setDisplayName(t); setSaved(false); }} maxLength={40} placeholder="What should we call you?" />
            <Text style={{ fontSize: fontSizes.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs }}>Avatar</Text>
            <Row style={{ flexWrap: 'wrap', marginBottom: spacing.md }}>
              {Object.entries(AVATARS).map(([key, emoji]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setAvatar(key);
                    setSaved(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`Avatar ${key}`}
                  accessibilityState={{ checked: avatar === key }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radii.md,
                    borderWidth: 2,
                    borderColor: avatar === key ? colors.forestGreen : colors.border,
                    backgroundColor: avatar === key ? colors.lightGreen : colors.white,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </Pressable>
              ))}
            </Row>
            <InlineError message={error} />
            {saved ? <InfoBanner tone="success" icon="checkmark-circle-outline" message="Profile saved." /> : null}
            <Button title="Save changes" variant="accent" icon="save-outline" onPress={save} loading={busy} disabled={!dirty} />
            <Muted style={{ marginTop: spacing.md }}>Your real name and student ID are managed by your school.</Muted>
          </>
        )}
      </Async>
      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmLogout} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}
