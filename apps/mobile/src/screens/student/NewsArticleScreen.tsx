import React from 'react';
import { Image, Linking, Text } from 'react-native';
import { endpoints } from '../../api';
import { Async, Badge, Body, Button, Card, Muted, Row, Screen, SectionTitle } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentStackScreen } from '../../navigation/types';
import { colors, fontSizes, radii, spacing } from '../../theme';
import { fmtDate } from '../../utils/format';
import { categoryName } from './NewsScreen';

export default function NewsArticleScreen({ route, navigation }: StudentStackScreen<'NewsArticle'>) {
  const { id } = route.params;
  const state = useApi(() => endpoints.newsArticle(id), [id]);
  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async state={state}>
        {(a) => (
          <>
            <Row style={{ marginBottom: spacing.sm }}>
              <Badge label={categoryName(a.category)} tone="green" />
              <Muted>{fmtDate(a.publishAt)}</Muted>
            </Row>
            <Text style={{ fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>{a.title}</Text>
            {a.imageUrl ? (
              <Image source={{ uri: a.imageUrl }} style={{ width: '100%', height: 180, borderRadius: radii.lg, marginBottom: spacing.md, backgroundColor: colors.lightGreen }} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : null}
            <Card style={{ backgroundColor: '#FFF8DC' }}>
              <Muted>In short</Muted>
              <Body style={{ fontWeight: '600' }}>{a.summary}</Body>
            </Card>
            {a.body ? <Body style={{ fontSize: 17, lineHeight: 26 }}>{a.body}</Body> : null}
            {a.sourceName ? (
              <Row style={{ marginTop: spacing.md }}>
                <Muted>Source: {a.sourceName}</Muted>
                {a.sourceUrl ? <Button title="Open" small variant="ghost" icon="open-outline" onPress={() => Linking.openURL(a.sourceUrl!)} /> : null}
              </Row>
            ) : null}
            {a.quiz ? (
              <>
                <SectionTitle>Knowledge check</SectionTitle>
                <Card>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{a.quiz.title}</Text>
                  <Muted>{a.quiz.questionCount} questions</Muted>
                  <Button
                    title="Take the GK quiz"
                    variant="accent"
                    icon="help-circle-outline"
                    onPress={() => navigation.navigate('Quiz', { kind: 'quiz', quizId: a.quiz!.id, title: a.quiz!.title })}
                    style={{ marginTop: spacing.md }}
                  />
                </Card>
              </>
            ) : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
