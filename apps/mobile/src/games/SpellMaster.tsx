import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, InfoBanner, Muted, ProgressBar, Row } from '../components/ui';
import { colors, fontSizes, radii, spacing, TOUCH } from '../theme';
import { buildSpellLevels, hintFor, normalizeAnswer, scramble } from './logic/words';
import type { GameProps } from './types';

const PASS_RATIO = 0.6;

export default function SpellMaster({ config, onFinish, onProgress }: GameProps) {
  const levels = useMemo(() => buildSpellLevels(config.words ?? [], config.rounds ?? 5, 3), [config.words, config.rounds]);
  const [level, setLevel] = useState(0);
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; word: string } | null>(null);
  const [levelCorrect, setLevelCorrect] = useState(0);
  const [levelDone, setLevelDone] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const words = levels[level] ?? [];
  const word = words[round] ?? '';
  const letters = useMemo(() => (word ? scramble(word) : ''), [word]);

  useEffect(() => onProgress?.({ score, level: level + 1 }), [score, level, onProgress]);

  if (!levels.length) {
    return <InfoBanner message="No words are configured for this game yet." />;
  }

  function check() {
    if (!word || feedback) return;
    const ok = normalizeAnswer(answer) === word;
    if (ok) {
      setScore((s) => s + (hintUsed ? 5 : 10) + level * 5);
      setLevelCorrect((c) => c + 1);
    }
    setFeedback({ ok, word });
  }

  function next() {
    setFeedback(null);
    setAnswer('');
    setHintUsed(false);
    if (round + 1 < words.length) {
      setRound((r) => r + 1);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setLevelDone(true);
    }
  }

  if (levelDone) {
    const passed = levelCorrect / words.length >= PASS_RATIO;
    const last = level + 1 >= levels.length;
    return (
      <Card style={{ alignItems: 'center' }}>
        <Text style={styles.big}>{passed ? 'Level complete!' : 'Good try!'}</Text>
        <Muted style={{ textAlign: 'center' }}>
          You spelled {levelCorrect} of {words.length} words correctly in level {level + 1}.
        </Muted>
        <Text style={styles.score}>Score: {score}</Text>
        {passed && !last ? (
          <Button
            title={`Start level ${level + 2}`}
            variant="accent"
            icon="arrow-forward"
            onPress={() => {
              setLevel((l) => l + 1);
              setRound(0);
              setLevelCorrect(0);
              setLevelDone(false);
            }}
            style={{ alignSelf: 'stretch', marginTop: spacing.md }}
          />
        ) : null}
        <Button
          title="Finish game"
          variant={passed && !last ? 'secondary' : 'primary'}
          icon="flag-outline"
          onPress={() =>
            onFinish({
              score,
              level: level + 1,
              outcome: passed || level > 0 ? 'completed' : 'failed',
              summary: last && passed ? 'You finished every level!' : `Reached level ${level + 1}`,
            })
          }
          style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
        />
      </Card>
    );
  }

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Badge label={`Level ${level + 1} of ${levels.length}`} tone="yellow" />
        <Text style={styles.scoreSmall}>Score {score}</Text>
      </Row>
      <ProgressBar value={(round / Math.max(1, words.length)) * 100} />
      <Muted style={{ marginTop: 4 }}>
        Word {round + 1} of {words.length}
      </Muted>

      <Card style={{ marginTop: spacing.md, alignItems: 'center' }}>
        <Muted>Unscramble the letters to spell the word</Muted>
        <View style={styles.tiles} accessibilityLabel={`Scrambled letters: ${letters.split('').join(' ')}`}>
          {letters.split('').map((ch, i) => (
            <View key={`${ch}-${i}`} style={styles.tile}>
              <Text style={styles.tileText}>{ch}</Text>
            </View>
          ))}
        </View>
        {hintUsed ? <Muted>Hint: {hintFor(word)}</Muted> : null}
      </Card>

      <TextInput
        ref={inputRef}
        value={answer}
        onChangeText={setAnswer}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        placeholder="Type the word"
        placeholderTextColor={colors.locked}
        style={styles.input}
        editable={!feedback}
        onSubmitEditing={feedback ? next : check}
        returnKeyType="done"
        accessibilityLabel="Your spelling"
        autoFocus
      />

      {feedback ? (
        <>
          <InfoBanner
            tone={feedback.ok ? 'success' : 'danger'}
            icon={feedback.ok ? 'checkmark-circle' : 'close-circle'}
            message={feedback.ok ? 'Correct! Well spelled.' : `Not quite — the word was “${feedback.word.toUpperCase()}”.`}
          />
          <Button title={round + 1 < words.length ? 'Next word' : 'See results'} variant="accent" icon="arrow-forward" onPress={next} />
        </>
      ) : (
        <Row>
          <Button title="Hint" variant="secondary" icon="bulb-outline" onPress={() => setHintUsed(true)} disabled={hintUsed} style={{ flex: 1 }} />
          <Button title="Check" variant="accent" icon="checkmark" onPress={check} disabled={!answer.trim()} style={{ flex: 2 }} />
        </Row>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  tile: { width: 42, height: 48, borderRadius: radii.md, backgroundColor: colors.mangoYellow, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.forestGreen },
  input: {
    minHeight: TOUCH + 8,
    borderWidth: 2,
    borderColor: colors.forestGreen,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.white,
    marginVertical: spacing.md,
    letterSpacing: 2,
  },
  big: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.forestGreen, marginBottom: spacing.sm },
  score: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  scoreSmall: { fontSize: fontSizes.md, fontWeight: '800', color: colors.forestGreen },
});
