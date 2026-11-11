import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { NEWS_CATEGORIES } from '@mango/shared';
import { endpoints } from '../../api';
import { Async, Badge, Card, Chip, ChipRow, Muted, Row, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { StudentTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';
import { fmtDate } from '../../utils/format';

export const categoryName = (code: string) => NEWS_CATEGORIES.find((c) => c.code === code)?.name ?? code;

export default function NewsScreen({ navigation }: StudentTabScreen<'News'>) {
  const [category, setCategory] = useState<string | undefined>();
  const cats = useApi(endpoints.newsCategories);
  const list = useApi(() => endpoints.news(category), [category]);

  return (
    <Screen
      refreshing={list.refreshing}
      onRefresh={() => {
        void cats.refresh();
        return list.refresh();
      }}
    >
      <ChipRow>
        <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
        {(cats.data ?? NEWS_CATEGORIES.map((c) => ({ ...c, articleCount: -1 }))).map((c) => (
          <Chip key={c.code} label={c.articleCount >= 0 ? `${c.name} (${c.articleCount})` : c.name} selected={category === c.code} onPress={() => setCategory(c.code)} />
        ))}
      </ChipRow>
      <Async
        state={list}
        isEmpty={(d) => d.items.length === 0}
        empty={{ icon: 'newspaper-outline', title: 'No stories yet', message: category ? `Nothing in ${categoryName(category)} right now. Check back soon!` : 'New stories are added regularly.' }}
      >
        {(d) =>
          d.items.map((a) => (
            <Card key={a._id} onPress={() => navigation.navigate('NewsArticle', { id: a._id, title: a.title })} accessibilityLabel={a.title}>
              <Row style={{ marginBottom: spacing.xs, flexWrap: 'wrap' }}>
                <Badge label={categoryName(a.category)} tone="green" />
                {a.featured ? <Badge label="Featured" tone="yellow" icon="star" /> : null}
                {a.quizId ? <Badge label="Quiz" tone="info" icon="help-circle" /> : null}
              </Row>
              <Text style={{ fontSize: fontSizes.md, fontWeight: '800', color: colors.text }}>{a.title}</Text>
              <Muted numberOfLines={3}>{a.summary}</Muted>
              <View style={{ marginTop: spacing.xs }}>
                <Muted style={{ fontSize: fontSizes.xs }}>
                  {fmtDate(a.publishAt)}
                  {a.sourceName ? ` · ${a.sourceName}` : ''}
                </Muted>
              </View>
            </Card>
          ))
        }
      </Async>
    </Screen>
  );
}
