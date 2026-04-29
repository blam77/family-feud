export const SCHEDULES = {
  2: [[0, 1]],
  3: [[0, 1], [1, 2], [2, 0]],
  4: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]
};

export function scheduleFor(teamCount) {
  return SCHEDULES[teamCount] || SCHEDULES[3];
}

export function playingTeamsForRound(state, N) {
  if (!state.rotationOrder) return [];
  const schedule = scheduleFor(state.teams.length);
  const pair = schedule[(N - 1) % schedule.length];
  return [state.rotationOrder[pair[0]], state.rotationOrder[pair[1]]];
}

export function sittingTeamsForRound(state, N) {
  if (!state.rotationOrder) return [];
  const playing = new Set(playingTeamsForRound(state, N));
  return state.rotationOrder.filter((id) => !playing.has(id));
}

export function isPlayingThisRound(state, teamId) {
  if (!state.rotationOrder) return false;
  const N = state.currentRoundIdx + 1;
  return playingTeamsForRound(state, N).includes(teamId);
}
