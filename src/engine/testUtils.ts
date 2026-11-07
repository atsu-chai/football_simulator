import { tactic } from '../data/formations';
import { createMatch } from './match';
import { Tactics } from './types';

export const makeTestMatch = (a: Tactics = tactic({}), b: Tactics = tactic({})) =>
  createMatch({
    teams: [
      { name: 'A', short: 'A', color: '#111111', tactics: a },
      { name: 'B', short: 'B', color: '#222222', tactics: b },
    ],
    seed: 1,
  });
