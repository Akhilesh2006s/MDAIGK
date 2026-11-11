import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Muted, ProgressBar, Row } from '../components/ui';
import { colors, fontSizes, radii, spacing } from '../theme';
import { generateQuestion, normalizeOps, scoreFor, type MathQuestion } from './logic/mathSprint';
import type { GameProps } from './types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

export default function MathSprint({ config, onFinish, onProgress }: GameProps) {
  const duration = Math.max(10, Math.min(600, config.durationSec ?? 60));
  const ops = useMemo(() => normalizeOps(config.operations), [config.operations]);
  const maxOperand = config.maxOperand ?? 20;
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(duration);
  const [q, setQ] = useState<MathQuestion>(() => generateQuestion(ops, maxOperand));
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const done = useRef(false);
  const latest = useRef({ score, correct, answered });
  latest.current = { score, correct, answered };

  const level = 1 + Math.floor(correct / 5);
  useEffect(() => onProgress?.({ score, level }), [score, level, onProgress]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);

  useEffect(() => {
    if (started && left === 0 && !done.current) {
      done.current = true;
      const r = latest.current;
      onFinish({
        score: r.score,
        level: 1 + Math.floor(r.correct / 5),
        outcome: 'completed',
        summary: `${r.correct} correct out of ${r.answered} answered in ${duration}s`,
      });
    }
  }, [left, started, onFinish, duration]);

  function submit(value: string) {
    if (!value || left === 0) return;
    const ok = Number(value) === q.answer;
    setAnswered((a) => a + 1);
    if (ok) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((s) => s + scoreFor(nextStreak));
      setCorrect((c) => c + 1);
    } else {
      setStreak(0);
    }
    setFlash(ok ? 'ok' : 'bad');
    setTimeout(() => setFlash(null), 250);
    setInput('');
    setQ(generateQuestion(ops, maxOperand));
  }

  function press(k: (typeof KEYS)[number]) {
    if (k === 'clear') return setInput('');
    if (k === 'back') return setInput((s) => s.slice(0, -1));
    const next = (input + k).replace(/^0+(?=\d)/, '').slice(0, 5);
    setInput(next);
    // auto-submit once the typed answer has as many digits as the correct one
    if (next.length >= String(q.answer).length) submit(next);
  }

  if (!started) {
    return (
      <Card style={{ alignItems: 'center' }}>
        <Text style={styles.big}>Ready?</Text>
        <Muted style={{ textAlign: 'center' }}>
          Answer as many sums as you can in {duration} seconds. Operations: {ops.join('  ')}. Answers submit automatically when you’ve typed enough digits.
        </Muted>
        <Button title="Start sprint" variant="accent" icon="flash-outline" onPress={() => setStarted(true)} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
      </Card>
    );
  }

  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Badge label={`${left}s left`} tone={left <= 10 ? 'danger' : 'yellow'} icon="timer-outline" />
        <Text style={styles.score}>Score {score}</Text>
      </Row>
      <ProgressBar value={(left / duration) * 100} color={left <= 10 ? colors.danger : colors.primary} style={{ marginVertical: spacing.sm }} />
      <View style={[styles.qBox, flash === 'ok' && { backgroundColor: colors.successBg }, flash === 'bad' && { backgroundColor: colors.dangerBg }]}>
        <Text style={styles.question} accessibilityLabel={`What is ${q.text}`}>
          {q.text} =
        </Text>
        <Text style={styles.answer}>{input || ' '}</Text>
      </View>
      <Muted style={{ textAlign: 'center', marginBottom: spacing.sm }}>
        {correct} correct · {answered - correct} wrong {streak > 1 ? `· streak ×${streak}` : ''}
      </Muted>
      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            accessibilityRole="button"
            accessibilityLabel={k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k}
            style={({ pressed }) => [styles.key, (k === 'back' || k === 'clear') && styles.keyAlt, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.keyText}>{k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Submit answer" variant="accent" onPress={() => submit(input)} disabled={!input} />
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.forestGreen, marginBottom: spacing.sm },
  score: { fontSize: fontSizes.md, fontWeight: '800', color: colors.forestGreen },
  qBox: { backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  question: { fontSize: 40, fontWeight: '900', color: colors.text },
  answer: { fontSize: 36, fontWeight: '800', color: colors.forestGreen, minHeight: 44 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, marginBottom: spacing.md },
  key: { width: '31%', height: 58, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  keyAlt: { backgroundColor: colors.lightGreen },
  keyText: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.text },
});
