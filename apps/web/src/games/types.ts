import type { GameConfig } from '../api/portalTypes';

export interface GameResult {
  score: number;
  level: number;
  outcome: 'completed' | 'failed';
  summary?: string;
}

export interface GameProps {
  config: GameConfig;
  onFinish: (result: GameResult) => void;
  /** Live score/level so the host can save progress if the student leaves mid-game. */
  onProgress?: (p: { score: number; level: number }) => void;
}
