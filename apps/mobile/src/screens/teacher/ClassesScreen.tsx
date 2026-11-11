import React from 'react';
import { Text, View } from 'react-native';
import { endpoints } from '../../api';
import { Async, Badge, Card, Ionicons, Muted, Row, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import type { TeacherTabScreen } from '../../navigation/types';
import { colors, fontSizes, spacing } from '../../theme';

export default function ClassesScreen({ navigation }: TeacherTabScreen<'Classes'>) {
  const state = useApi(endpoints.teacherClasses);
  return (
    <Screen refreshing={state.refreshing} onRefresh={state.refresh}>
      <Async
        state={state}
        isEmpty={(d) => d.length === 0}
        empty={{ icon: 'school-outline', title: 'No classes assigned', message: 'Your school administrator assigns classes and subjects to you.' }}
      >
        {(classes) =>
          classes.map((c) => (
            <Card
              key={c.sectionId}
              onPress={c.locked ? undefined : () => navigation.navigate('ClassStudents', { sectionId: c.sectionId, label: c.label })}
              accessibilityLabel={`${c.label} students`}
              style={c.locked ? { opacity: 0.6 } : undefined}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: fontSizes.lg, fontWeight: '800', color: colors.text }}>{c.label}</Text>
                  <Muted>Academic year {c.academicYear}</Muted>
                </View>
                {c.locked ? <Badge label="Not enabled" tone="muted" icon="lock-closed" /> : <Ionicons name="chevron-forward" size={22} color={colors.locked} />}
              </Row>
              <Row style={{ flexWrap: 'wrap', marginTop: spacing.sm }}>
                {c.subjects.map((s) => (
                  <Badge key={s._id} label={s.name} tone="yellow" />
                ))}
              </Row>
              {c.locked ? <Muted style={{ marginTop: spacing.sm }}>This class level isn’t enabled for your school’s plan.</Muted> : null}
            </Card>
          ))
        }
      </Async>
    </Screen>
  );
}
