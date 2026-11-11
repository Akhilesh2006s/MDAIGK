import React, { useState } from 'react';
import { Alert } from 'react-native';
import { endpoints, errorMessage } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { Button, InfoBanner, InlineError, Screen, TextField } from '../../components/ui';

export default function ChangePasswordScreen() {
  const { signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords don’t match.');
    if (next === current) return setError('Choose a password different from your current one.');
    setBusy(true);
    setError(null);
    try {
      await endpoints.changePassword(current, next);
      // The API revokes every refresh token, so start a fresh session.
      Alert.alert('Password changed', 'Please sign in again with your new password.', [{ text: 'OK', onPress: () => signOut('Password changed. Sign in with your new password.') }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <InfoBanner message="For your security you’ll be signed out on all devices after changing your password." />
      <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <TextField label="New password (min. 8 characters)" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
      <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" onSubmitEditing={submit} />
      <InlineError message={error} />
      <Button title="Change password" icon="key-outline" onPress={submit} loading={busy} disabled={!current || !next || !confirm} />
    </Screen>
  );
}
