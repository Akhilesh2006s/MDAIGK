import React from 'react';
import { Text, View } from 'react-native';
import { endpoints, type CertificationLevelRow } from '../../api';
import { Async, Badge, Button, Card, Divider, IconCircle, ListRow, Muted, Row, Screen, SectionTitle } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { fmtDate, fmtPercent, lockReasonText } from '../../utils/format';

export default function CertificatesScreen({ navigation }: StudentStackScreen<'Certificates'>) {
  const state = useApi(endpoints.certificationLevels, [], { reloadOnFocus: true });

  const levelCard = (l: CertificationLevelRow) => (
    <Card key={l.id} style={l.state === 'certified' ? { borderColor: colors.gold } : l.state === 'locked' ? { opacity: 0.75 } : { borderColor: colors.mangoYellow, borderWidth: 2 }}>
      <Row gap={spacing.md}>
        <IconCircle
          icon={l.state === 'certified' ? 'ribbon' : l.state === 'locked' ? 'lock-closed' : 'school-outline'}
          bg={l.state === 'certified' ? colors.goldBg : l.state === 'locked' ? '#EFEFEA' : '#FFF4CC'}
          color={l.state === 'certified' ? colors.gold : l.state === 'locked' ? colors.locked : colors.forestGreen}
          size={48}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSizes.md, fontWeight: '800', color: colors.text }}>
            Level {l.level} · {l.title}
          </Text>
          <Muted>
            Pass mark {l.passPercent}%{l.attempts ? ` · best ${fmtPercent(l.bestPercent)} in ${l.attempts} attempt${l.attempts === 1 ? '' : 's'}` : ''}
          </Muted>
        </View>
        <Badge label={l.state === 'certified' ? 'Certified' : l.state === 'available' ? 'Available' : 'Locked'} tone={l.state === 'certified' ? 'gold' : l.state === 'available' ? 'yellow' : 'muted'} />
      </Row>
      {l.description ? <Muted style={{ marginTop: spacing.sm }}>{l.description}</Muted> : null}
      {l.state === 'locked' ? <Muted style={{ marginTop: spacing.sm, color: colors.textMuted }}>🔒 {lockReasonText(l.lockReason)}</Muted> : null}
      {l.state === 'available' ? (
        <Button
          title={l.attempts ? 'Try the assessment again' : 'Take the assessment'}
          variant="accent"
          icon="play"
          onPress={() => navigation.navigate('Quiz', { kind: 'certification', levelId: l.id, title: `Level ${l.level}` })}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
      {l.certificate ? (
        <Button title="View certificate" variant="gold" icon="ribbon-outline" onPress={() => navigation.navigate('CertificateDetail', { id: l.certificate!.id })} style={{ marginTop: spacing.md }} />
      ) : null}
    </Card>
  );

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state} isEmpty={(d) => d.levels.length === 0} empty={{ icon: 'ribbon-outline', title: 'Certification is coming soon' }}>
        {(d) => {
          const certified = d.levels.filter((l) => l.state === 'certified');
          return (
            <>
              <View style={{ backgroundColor: colors.forestGreen, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconCircle icon="ribbon" bg={colors.gold} color={colors.white} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.lightGreen }}>Your certification level</Text>
                  <Text style={{ color: colors.white, fontSize: fontSizes.xxl, fontWeight: '900' }}>{d.currentLevel ? `Level ${d.currentLevel}` : 'Not yet certified'}</Text>
                  <Text style={{ color: colors.lightGreen }}>
                    {certified.length} of {d.levels.length} levels earned
                  </Text>
                </View>
              </View>

              <SectionTitle>Levels</SectionTitle>
              {d.levels.map(levelCard)}

              <SectionTitle>Certificate history</SectionTitle>
              <Card>
                {certified.length === 0 ? (
                  <Muted>Pass a level assessment to earn your first certificate.</Muted>
                ) : (
                  certified.map((l, i) => (
                    <View key={l.id}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={`Level ${l.level} · ${l.title}`}
                        subtitle={`${l.certificate?.certificateNumber ?? ''} · issued ${fmtDate(l.certificate?.issuedAt)}`}
                        left={<IconCircle icon="document-text-outline" bg={colors.goldBg} color={colors.gold} size={36} />}
                        onPress={() => l.certificate && navigation.navigate('CertificateDetail', { id: l.certificate.id })}
                      />
                    </View>
                  ))
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
