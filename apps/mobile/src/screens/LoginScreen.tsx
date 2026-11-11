import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { endpoints, errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Button, InfoBanner, InlineError, Ionicons, Segmented, TextField } from '../components/ui';
import { colors, fontSizes, radii, spacing } from '../theme';

type Mode = 'student' | 'teacher';

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const [mode, setMode] = useState<Mode>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = mode === 'teacher' ? email.trim().length > 3 && password.length > 0 : schoolCode.trim().length >= 2 && studentCode.trim().length > 0 && pin.length >= 4;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = mode === 'teacher' ? await endpoints.teacherLogin(email, password) : await endpoints.studentLogin(schoolCode, studentCode, pin);
      await signIn(resp);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>MD</Text>
            </View>
            <Text style={styles.brand}>Mango Dude</Text>
            <Text style={styles.tagline}>Learn, play and grow every day</Text>
          </View>

          <View style={styles.card}>
            <Segmented
              options={[
                { value: 'student', label: 'Student' },
                { value: 'teacher', label: 'Teacher' },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
            />
            {notice ? <InfoBanner message={notice} /> : null}

            {mode === 'teacher' ? (
              <>
                <TextField label="School email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="name@school.edu.in" returnKeyType="next" />
                <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showSecret} autoCapitalize="none" autoComplete="password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
              </>
            ) : (
              <>
                <TextField label="School code" value={schoolCode} onChangeText={setSchoolCode} autoCapitalize="characters" placeholder="e.g. GVS001" autoCorrect={false} />
                <TextField label="Student ID" value={studentCode} onChangeText={setStudentCode} autoCapitalize="characters" placeholder="e.g. GVS401A" autoCorrect={false} />
                <TextField label="PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\s/g, ''))} secureTextEntry={!showSecret} keyboardType="number-pad" maxLength={12} onSubmitEditing={submit} returnKeyType="go" />
              </>
            )}

            <Button
              title={showSecret ? 'Hide' : 'Show'}
              variant="ghost"
              small
              icon={showSecret ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setShowSecret((s) => !s)}
              style={{ alignSelf: 'flex-end', marginTop: -spacing.sm }}
            />

            <InlineError message={error} />
            <Button title="Sign in" onPress={submit} loading={busy} disabled={!canSubmit} variant={mode === 'student' ? 'accent' : 'primary'} icon="log-in-outline" />
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.hint}>
                {mode === 'student' ? 'Your school gives you your school code, student ID and PIN.' : 'School administrators sign in on the web dashboard.'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.forestGreen },
  container: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mangoYellow, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  logoText: { fontSize: fontSizes.xl, fontWeight: '900', color: colors.forestGreen },
  brand: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.white },
  tagline: { fontSize: fontSizes.md, color: colors.lightGreen, marginTop: spacing.xs },
  card: { backgroundColor: colors.warmIvory, borderRadius: radii.lg, padding: spacing.lg },
  hintRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, alignItems: 'flex-start' },
  hint: { flex: 1, fontSize: fontSizes.xs, color: colors.textMuted },
});
