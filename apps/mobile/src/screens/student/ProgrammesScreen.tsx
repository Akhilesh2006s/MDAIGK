import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints, type ProgrammeCard } from '../../api';
import { Async, Badge, Button, Card, IconCircle, InfoBanner, Muted, PremiumBadge, ProgressBar, Row, Screen, SectionTitle, type IconName } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { fmtDate, lockReasonText } from '../../utils/format';

export const PROGRAMME_ICONS: Record<string, IconName> = {
  AI_ACADEMY: 'hardware-chip-outline',
  HEALTH_ACADEMY: 'fitness-outline',
  YOUNG_ENTREPRENEUR: 'briefcase-outline',
  CHESS_ACADEMY: 'extension-puzzle-outline',
  YOUNG_SCIENTIST: 'flask-outline',
};

export default function ProgrammesScreen({ navigation }: StudentStackScreen<'Programmes'>) {
  const state = useApi(endpoints.programmes, [], { reloadOnFocus: true });
  const [lockedInfo, setLockedInfo] = useState<string | null>(null);

  const card = (p: ProgrammeCard) => (
    <Card
      key={p.id}
      onPress={() => (p.locked ? setLockedInfo(p.id) : navigation.navigate('ProgrammeDetail', { id: p.id, name: p.name }))}
      accessibilityLabel={`${p.name}${p.locked ? ', locked' : ''}`}
      style={p.locked ? { opacity: 0.85 } : p.premium ? { borderColor: colors.gold } : undefined}
    >
      <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
        <IconCircle icon={p.locked ? 'lock-closed' : PROGRAMME_ICONS[p.code] ?? 'rocket-outline'} bg={p.premium ? colors.goldBg : colors.lightGreen} color={p.locked ? colors.locked : p.premium ? colors.gold : colors.primary} size={48} />
        <View style={{ flex: 1 }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>{p.name}</Text>
          </Row>
          <Row style={{ marginVertical: 4, flexWrap: 'wrap' }}>
            {p.premium ? <PremiumBadge /> : <Badge label="Enrichment" tone="green" />}
            {p.locked ? <Badge label="Locked" tone="muted" icon="lock-closed" /> : null}
            {p.enrolment?.completed ? <Badge label="Completed" tone="success" icon="checkmark" /> : null}
          </Row>
          <Muted>{p.description}</Muted>
          <Muted style={{ fontSize: fontSizes.xs, marginTop: 2 }}>
            {p.moduleCount} module{p.moduleCount === 1 ? '' : 's'}
            {p.validUntil && !p.locked ? ` · access until ${fmtDate(p.validUntil)}` : ''}
          </Muted>
        </View>
      </Row>
      {p.enrolment && !p.locked ? (
        <View style={{ marginTop: spacing.md }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <Muted>Your progress</Muted>
            <Text style={{ fontWeight: '700', color: colors.text }}>{Math.round(p.enrolment.progressPercent)}%</Text>
          </Row>
          <ProgressBar value={p.enrolment.progressPercent} color={p.premium ? colors.gold : colors.primary} />
        </View>
      ) : null}
      {p.locked ? (
        lockedInfo === p.id ? (
          <View style={{ marginTop: spacing.md }}>
            <InfoBanner icon="lock-closed-outline" tone="muted" message={lockReasonText(p.lockReason)} />
          </View>
        ) : (
          <Muted style={{ marginTop: spacing.sm }}>Tap to see why this is locked.</Muted>
        )
      ) : (
        <Button
          title={p.action === 'continue' ? 'Continue' : 'Explore'}
          variant={p.premium ? 'gold' : 'accent'}
          icon={p.action === 'continue' ? 'play' : 'compass-outline'}
          onPress={() => navigation.navigate('ProgrammeDetail', { id: p.id, name: p.name })}
          style={{ marginTop: spacing.md }}
        />
      )}
    </Card>
  );

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state} isEmpty={(d) => d.premiumAcademies.length + d.otherProgrammes.length === 0} empty={{ icon: 'rocket-outline', title: 'No programmes yet' }}>
        {(d) => (
          <>
            <SectionTitle action={<PremiumBadge />}>Premium academies</SectionTitle>
            <Muted style={{ marginBottom: spacing.md }}>Special academies your school can unlock for you.</Muted>
            {d.premiumAcademies.length ? d.premiumAcademies.map(card) : <Muted>No premium academies available.</Muted>}
            {d.otherProgrammes.length ? (
              <>
                <SectionTitle>Enrichment programme</SectionTitle>
                {d.otherProgrammes.map(card)}
              </>
            ) : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
