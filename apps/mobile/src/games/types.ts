import type { GameConfig } from '../api/types';

export interface GameResult {
  score: number;
  level: number;
  outcome: 'completed' | 'failed';
  summary?: string;
}

export interface GameProps {
  config: GameConfig;
  onFinish: (result: GameResult) => void;
  /** Live score/level so the host can save progress if the student leaves. */
  onProgress?: (p: { score: number; level: number }) => void;
}
