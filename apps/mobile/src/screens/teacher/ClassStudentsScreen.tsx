import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { endpoints } from '../../api';
import { Async, Badge, Card, Divider, EmptyState, IconCircle, ListRow, Screen, TextField } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherStackScreen } from '../../navigation/types';
import { colors, fontSizes } from '../../theme';
import { fmtPercent } from '../../utils/format';

export default function ClassStudentsScreen({ route, navigation }: TeacherStackScreen<'ClassStudents'>) {
  const { sectionId } = route.params;
  const state = useApi(() => endpoints.sectionStudents(sectionId), [sectionId]);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!state.data) return [];
    if (!s) return state.data;
    return state.data.filter((r) => r.name.toLowerCase().includes(s) || r.studentCode.toLowerCase().includes(s) || (r.displayName ?? '').toLowerCase().includes(s));
  }, [q, state.data]);

  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <TextField label="Search students" placeholder="Name or student ID" value={q} onChangeText={setQ} autoCorrect={false} clearButtonMode="while-editing" />
      <Async state={state} isEmpty={(d) => d.length === 0} empty={{ icon: 'people-outline', title: 'No students yet', message: 'No active students are enrolled in this class section.' }}>
        {(rows) => (
          <>
            <Text style={{ color: colors.textMuted, marginBottom: 8 }}>
              {filtered.length} of {rows.length} students
            </Text>
            {filtered.length === 0 ? (
              <EmptyState icon="search-outline" title="No matches" message={`No student matches “${q}”.`} />
            ) : (
              <Card>
                {filtered.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={s.name}
                      subtitle={`${s.studentCode} · ${s.attempts} attempts${s.certificationLevel ? ` · Cert. level ${s.certificationLevel}` : ''}`}
                      left={<IconCircle icon="person-outline" size={36} />}
                      right={
                        <Text style={{ fontWeight: '800', fontSize: fontSizes.md, color: s.averagePercent !== null && s.averagePercent < 50 ? colors.danger : colors.primary }}>
                          {fmtPercent(s.averagePercent)}
                        </Text>
                      }
                      onPress={() => navigation.navigate('StudentProfile', { studentId: s.id, name: s.name })}
                    />
                  </View>
                ))}
              </Card>
            )}
            <Badge label="Average = mean quiz score" tone="muted" />
          </>
        )}
      </Async>
    </Screen>
  );
}
