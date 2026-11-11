import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, endpoints, errorMessage, type Certificate } from '../../api';
import { Async, Button, InfoBanner, InlineError, Ionicons, Muted, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { fmtDate, fmtPercent } from '../../utils/format';

/** Download the certificate PDF with the bearer token, then open the share sheet. */
async function downloadAndShare(cert: Certificate): Promise<string> {
  // Make sure the access token is fresh (this request refreshes it if expired).
  await endpoints.certificate(cert._id);
  const safeName = cert.certificateNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  const target = new File(Paths.cache, `${safeName}.pdf`);
  const file = await File.downloadFileAsync(endpoints.certificatePdfUrl(cert._id), target, { headers: api.authHeaders(), idempotent: true });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `Certificate ${cert.certificateNumber}`, UTI: 'com.adobe.pdf' });
    return 'Certificate ready to share.';
  }
  return `Saved to ${file.uri}`;
}

export default function CertificateDetailScreen({ route }: StudentStackScreen<'CertificateDetail'>) {
  const { id } = route.params;
  const state = useApi(() => endpoints.certificate(id), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function share(cert: Certificate) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      setInfo(await downloadAndShare(cert));
    } catch (e) {
      setError(`Couldn’t download the PDF. ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(c) => (
          <>
            <View style={{ backgroundColor: colors.warmIvory, borderWidth: 3, borderColor: colors.gold, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg }}>
              <Ionicons name="ribbon" size={56} color={colors.gold} />
              <Text style={{ color: colors.textMuted, marginTop: spacing.sm, letterSpacing: 2 }}>CERTIFICATE OF ACHIEVEMENT</Text>
              <Text style={{ fontSize: fontSizes.xxl, fontWeight: '900', color: colors.forestGreen, textAlign: 'center', marginVertical: spacing.sm }}>{c.studentDisplayName}</Text>
              <Muted>has successfully completed</Muted>
              <Text style={{ fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, marginTop: spacing.xs }}>
                Level {c.level}
                {c.levelTitle ? ` · ${c.levelTitle}` : ''}
              </Text>
              {c.percent !== undefined ? <Muted>Score {fmtPercent(c.percent)}</Muted> : null}
              <Muted style={{ marginTop: spacing.md }}>{c.schoolName}</Muted>
              <Muted>Issued {fmtDate(c.issuedAt)}</Muted>
              <Text style={{ marginTop: spacing.md, fontWeight: '700', color: colors.text }}>No. {c.certificateNumber}</Text>
            </View>
            <Button title="Download / share PDF" variant="gold" icon="share-outline" onPress={() => share(c)} loading={busy} />
            <InlineError message={error} />
            {info ? <InfoBanner tone="success" icon="checkmark-circle-outline" message={info} /> : null}
            {c.verificationUrl ? <Muted style={{ marginTop: spacing.md, textAlign: 'center' }}>Verify at {c.verificationUrl}</Muted> : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
