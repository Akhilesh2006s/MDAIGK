import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, InfoBanner, Ionicons, Muted, ProgressBar, Row } from '../components/ui';
import { colors, fontSizes, radii, spacing, TOUCH } from '../theme';
import { shuffle } from './logic/words';
import type { GameProps } from './types';

export default function GrammarFixes({ config, onFinish, onProgress }: GameProps) {
  // shuffle sentence order and option order, remapping the correct index
  const items = useMemo(
    () =>
      shuffle(config.sentences ?? []).map((s) => {
        const order = shuffle(s.options.map((_, i) => i));
        return { wrong: s.wrong, options: order.map((i) => s.options[i]), correctIndex: order.indexOf(s.correctIndex) };
      }),
    [config.sentences],
  );
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);

  useEffect(() => onProgress?.({ score, level: 1 }), [score, onProgress]);

  if (!items.length) return <InfoBanner message="No sentences are configured for this game yet." />;
  const item = items[index];
  const answered = picked !== null;
  const isLast = index + 1 >= items.length;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    if (i === item.correctIndex) {
      setScore((s) => s + 10);
      setCorrect((c) => c + 1);
    }
  }

  function next() {
    if (isLast) {
      const ratio = correct / items.length;
      onFinish({ score, level: 1, outcome: ratio >= 0.5 ? 'completed' : 'failed', summary: `${correct} of ${items.length} sentences fixed` });
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Badge label={`Sentence ${index + 1} of ${items.length}`} tone="yellow" />
        <Text style={styles.score}>Score {score}</Text>
      </Row>
      <ProgressBar value={(index / items.length) * 100} />
      <Card style={{ marginTop: spacing.md }}>
        <Muted>This sentence has a mistake:</Muted>
        <Text style={styles.wrong}>{item.wrong}</Text>
        <Muted>Choose the corrected sentence.</Muted>
      </Card>
      {item.options.map((o, i) => {
        const isCorrect = i === item.correctIndex;
        const isPicked = i === picked;
        const bg = !answered ? colors.white : isCorrect ? colors.successBg : isPicked ? colors.dangerBg : colors.white;
        const border = !answered ? colors.border : isCorrect ? colors.success : isPicked ? colors.danger : colors.border;
        return (
          <Pressable
            key={i}
            onPress={() => pick(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: isPicked, disabled: answered }}
            style={({ pressed }) => [styles.option, { backgroundColor: bg, borderColor: border }, pressed && !answered && { opacity: 0.7 }]}
          >
            <Text style={styles.optionText}>{o}</Text>
            {answered && isCorrect ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
            {answered && isPicked && !isCorrect ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
          </Pressable>
        );
      })}
      {answered ? (
        <Button title={isLast ? 'Finish' : 'Next sentence'} variant="accent" icon={isLast ? 'flag-outline' : 'arrow-forward'} onPress={next} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  score: { fontSize: fontSizes.md, fontWeight: '800', color: colors.forestGreen },
  wrong: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.danger, marginVertical: spacing.sm, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  option: { minHeight: TOUCH + 8, borderWidth: 2, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionText: { flex: 1, fontSize: fontSizes.md, color: colors.text, fontWeight: '600' },
});
