import { EventType, MATCH_SECONDS, MatchEvent, MatchState, Side } from './types';

export const gameMinute = (m: MatchState) => Math.min(90, Math.floor((m.t / MATCH_SECONDS) * 90));

export function addEvent(
  m: MatchState,
  type: EventType,
  text: string,
  team?: Side,
  extra?: Partial<MatchEvent>,
) {
  m.events.push({ t: m.t, minute: gameMinute(m), type, team, text, ...extra });
}
