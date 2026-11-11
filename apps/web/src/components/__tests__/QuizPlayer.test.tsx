import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../api/client';
import type { AttemptBody, AttemptResult, PublicQuiz } from '../../api/portalTypes';
import { QuizPlayer, describeSubmitError } from '../QuizPlayer';

const quiz: PublicQuiz = {
  id: 'q1',
  title: 'Planets',
  version: 3,
  questionCount: 2,
  totalMarks: 2,
  questions: [
    { id: 'a', prompt: 'Which planet is red?', options: ['Venus', 'Mars', 'Jupiter'], marks: 1 },
    { id: 'b', prompt: 'How many planets are there?', options: ['Seven', 'Eight'], marks: 1 },
  ],
};

const result: AttemptResult = {
  attemptId: 'att1',
  score: 1,
  maxScore: 2,
  percent: 50,
  correctCount: 1,
  questionCount: 2,
  review: [
    { questionId: 'a', prompt: 'Which planet is red?', options: ['Venus', 'Mars', 'Jupiter'], selectedIndex: 1, correctIndex: 1, correct: true },
    { questionId: 'b', prompt: 'How many planets are there?', options: ['Seven', 'Eight'], selectedIndex: 0, correctIndex: 1, correct: false, explanation: 'Pluto is a dwarf planet.' },
  ],
};

async function answerAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/Mars/));
  await user.click(screen.getByRole('button', { name: /Next/ }));
  await user.click(screen.getByLabelText(/Seven/));
}

describe('QuizPlayer', () => {
  it('shows one question at a time and reveals no answer key before submit', async () => {
    const submit = vi.fn(async () => result);
    const { container } = render(<QuizPlayer quiz={quiz} submit={submit} />);
    const user = userEvent.setup();

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Which planet is red?')).toBeInTheDocument();
    expect(screen.queryByText('How many planets are there?')).not.toBeInTheDocument();
    // nothing in the DOM marks a correct option before submitting
    expect(container.querySelector('.opt-correct, .is-correct, [data-correct]')).toBeNull();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    expect(JSON.stringify(quiz)).not.toMatch(/correctIndex/);

    await answerAll(user);
    expect(container.querySelector('.opt-correct')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));

    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Pluto is a dwarf planet.')).toBeInTheDocument();
    expect(container.querySelectorAll('.opt-correct')).toHaveLength(2);
    const body = (submit.mock.calls[0] as unknown as [AttemptBody])[0];
    expect(body.quizVersion).toBe(3);
    expect(body.answers).toEqual([
      { questionId: 'a', selectedIndex: 1 },
      { questionId: 'b', selectedIndex: 0 },
    ]);
  });

  it('reuses the same clientAttemptId when retrying after a network failure', async () => {
    const submit = vi
      .fn<(b: AttemptBody) => Promise<AttemptResult>>()
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Network error'))
      .mockResolvedValueOnce(result);
    render(<QuizPlayer quiz={quiz} submit={submit} />);
    const user = userEvent.setup();
    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    expect(await screen.findByText(/You seem to be offline/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try submitting again' }));
    expect(await screen.findByText('Quiz submitted')).toBeInTheDocument();

    expect(submit).toHaveBeenCalledTimes(2);
    const first = submit.mock.calls[0][0].clientAttemptId;
    const second = submit.mock.calls[1][0].clientAttemptId;
    expect(first).toBeTruthy();
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(second).toBe(first);
  });

  it('starts a new clientAttemptId for a fresh attempt after "Try again"', async () => {
    const submit = vi.fn<(b: AttemptBody) => Promise<AttemptResult>>(async () => result);
    render(<QuizPlayer quiz={quiz} submit={submit} />);
    const user = userEvent.setup();
    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    await user.click(await screen.findByRole('button', { name: /Try again/ }));
    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    await screen.findByText('Quiz submitted');
    expect(submit.mock.calls[1][0].clientAttemptId).not.toBe(submit.mock.calls[0][0].clientAttemptId);
  });

  it('warns about unanswered questions before submitting', async () => {
    const submit = vi.fn(async () => result);
    render(<QuizPlayer quiz={quiz} submit={submit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    expect(screen.getByText(/You have 2 unanswered questions/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Submit anyway' }));
    await screen.findByText('Quiz submitted');
    expect((submit.mock.calls[0] as unknown as [AttemptBody])[0].answers.every((a) => a.selectedIndex === -1)).toBe(true);
  });

  it('maps duplicate, version-mismatch and rate-limit errors to friendly messages', () => {
    expect(describeSubmitError(new ApiError(409, 'DUPLICATE_SUBMISSION', 'dup')).kind).toBe('duplicate');
    expect(describeSubmitError(new ApiError(409, 'QUIZ_VERSION_MISMATCH', 'old')).kind).toBe('version');
    expect(describeSubmitError(new ApiError(429, 'RATE_LIMITED', 'Slow down')).kind).toBe('rate');
    expect(describeSubmitError(new ApiError(503, 'INTERNAL', 'x')).kind).toBe('retry');
  });

  it('offers a reload when the quiz version changed', async () => {
    const onReload = vi.fn();
    const submit = vi.fn(async () => {
      throw new ApiError(409, 'QUIZ_VERSION_MISMATCH', 'reload');
    });
    render(<QuizPlayer quiz={quiz} submit={submit} onReload={onReload} />);
    const user = userEvent.setup();
    await answerAll(user);
    await user.click(screen.getByRole('button', { name: 'Submit quiz' }));
    await user.click(await screen.findByRole('button', { name: 'Reload quiz' }));
    expect(onReload).toHaveBeenCalled();
  });
});
