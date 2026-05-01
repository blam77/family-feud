import { getState, setState, subscribe, onPeerStatus, undo, resetAll } from './state.js';
import { playingTeamsForRound, sittingTeamsForRound } from './rotation.js';

let questionsCache = null;

async function loadQuestions() {
  if (questionsCache) return questionsCache;
  const res = await fetch('data/questions.json');
  if (!res.ok) throw new Error(`Failed to load questions: ${res.status}`);
  questionsCache = await res.json();
  return questionsCache;
}

loadQuestions().catch((e) => console.error(e));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function teamById(state, id) {
  return state.teams.find((t) => t.id === id);
}

function teamName(state, id) {
  return teamById(state, id)?.name || '?';
}

function teamInputsHTML(count, existingValues = {}) {
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const v = existingValues[i] ? `value="${escapeHtml(existingValues[i])}"` : '';
    rows.push(`<div class="team-input"><label>Team ${i}</label><input type="text" placeholder="Team ${i}" id="team-${i}" ${v} /></div>`);
  }
  return rows.join('');
}

function setupHTML(teamCount = 2) {
  return `
    <div class="host">
      <img class="feud-logo" src="Family-Feud-Logo-500x281.png" alt="Family Feud" style="margin-bottom: 8px;" />
      <h1 style="text-align: center;">HOST &mdash; SETUP</h1>
      <div class="panel setup-form">
        <h2>Number of teams</h2>
        <div style="display: flex; gap: 18px; font-family: system-ui; font-size: 16px;">
          ${[2, 3, 4].map((n) => `
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="radio" name="team-count" value="${n}" ${n === teamCount ? 'checked' : ''} />
              ${n} teams
            </label>
          `).join('')}
        </div>
        <h2 style="margin-top: 8px;">Team names (~5 players each)</h2>
        <div id="team-inputs">${teamInputsHTML(teamCount)}</div>
        <div class="button-row">
          <button class="primary" data-action="start-game">Start game</button>
        </div>
      </div>
      <div class="sync-pill" id="sync-pill"></div>
    </div>
  `;
}

function gameOverHTML(state) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  return `
    <div class="host">
      <h1>FINAL SCORES</h1>
      <div class="panel">
        <div class="host-team-list">
          ${sorted.map((t, i) => `
            <div class="host-team-row ${i === 0 ? 'controlling' : ''}">
              <span class="name">${escapeHtml(t.name)}${i === 0 ? ' — WINNER' : ''}</span>
              <span class="pts" style="color: var(--gold); font-size: 22px;">${t.score}</span>
            </div>
          `).join('')}
        </div>
        <div class="button-row" style="margin-top: 16px;">
          <button data-action="prev-round">&larr; Back to last round</button>
          <button class="primary" data-action="start-fast-money">Fast Money &rarr;</button>
          <button class="danger" data-action="new-game">New game</button>
        </div>
      </div>
      <div class="sync-pill" id="sync-pill"></div>
    </div>
  `;
}

function faceoffSection(state) {
  if (state.mode !== 'faceoff') return '';

  if (!state.rotationOrder) {
    return `
      <h2>Round 1: pick face-off teams</h2>
      <p style="color: var(--muted); margin-bottom: 8px; font-family: system-ui;">
        Click the 2 teams that raised hands first, in order.
        They play round 1; the rest sit. Click order locks the rotation for the whole game.
      </p>
      <div class="faceoff-buttons">
        ${state.teams.map((t) => {
          const picked = state.faceoffFirstPick === t.id;
          return `<button data-action="pick-faceoff-team" data-team-id="${t.id}" ${picked ? 'disabled' : ''}>
            ${escapeHtml(t.name)}${picked ? ' &mdash; raised first' : ''}
          </button>`;
        }).join('')}
        ${state.faceoffFirstPick ? `
          <button data-action="reset-faceoff-pick" style="margin-top: 4px;">Reset picks</button>
        ` : ''}
      </div>
    `;
  }

  const N = state.currentRoundIdx + 1;
  const playing = playingTeamsForRound(state, N);
  const sitting = sittingTeamsForRound(state, N);
  const sittingText = sitting.length === 0
    ? ''
    : ` ${sitting.map((id) => escapeHtml(teamName(state, id))).join(' & ')} sit${sitting.length === 1 ? 's' : ''} this round.`;
  return `
    <h2>Who won the face-off?</h2>
    <p style="color: var(--muted); margin-bottom: 8px; font-family: system-ui;">
      Higher-ranked answer wins control.${sittingText}
    </p>
    <div class="faceoff-buttons">
      ${playing.map((id) =>
        `<button data-action="pick-faceoff-winner" data-team-id="${id}">
          ${escapeHtml(teamName(state, id))} won
        </button>`
      ).join('')}
    </div>
  `;
}

function answersSection(state, round) {
  if (state.mode === 'setup') return '';
  return `
    <h2>Answers</h2>
    <div class="host-answers">
      ${round.answers.map((a, i) => `
        <div class="host-answer-row ${state.revealed[i] ? 'revealed' : ''}">
          <span>${escapeHtml(a.text)}</span>
          <span class="pts">${a.points}</span>
          <button data-action="reveal" data-idx="${i}" ${state.revealed[i] ? 'disabled' : ''}>
            ${state.revealed[i] ? 'Revealed' : 'Reveal'}
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function strikeIndicator(state) {
  if (state.mode === 'setup' || state.mode === 'faceoff') return '';
  return `
    <h2>Strikes</h2>
    <div class="host-strikes">
      ${[0, 1, 2].map((i) =>
        `<div class="x ${i < state.strikes ? 'lit' : ''}">X</div>`
      ).join('')}
    </div>
  `;
}

function actionButtons(state) {
  const round = state.rounds[state.currentRoundIdx];
  const isLast = state.currentRoundIdx >= state.rounds.length - 1;

  if (state.mode === 'play') {
    return `
      <div class="button-row">
        <button class="danger" data-action="strike">Strike (press X)</button>
        <button data-action="trigger-steal">Trigger steal</button>
        <button class="primary" data-action="end-round-controllers">
          End round &rarr; ${escapeHtml(teamName(state, state.controllingTeamId))} keeps ${state.pot}
        </button>
      </div>
    `;
  }
  if (state.mode === 'steal') {
    return `
      <div class="button-row">
        <button class="primary" data-action="steal-correct">
          Steal CORRECT &rarr; ${escapeHtml(teamName(state, state.stealingTeamId))} takes ${state.pot}
        </button>
        <button data-action="steal-failed">
          Steal FAILED &rarr; ${escapeHtml(teamName(state, state.controllingTeamId))} keeps ${state.pot}
        </button>
      </div>
    `;
  }
  if (state.mode === 'roundEnd') {
    return `
      <div class="button-row">
        ${isLast
          ? `<button class="primary" data-action="end-game">End game &rarr; show final scores</button>`
          : `<button class="primary" data-action="next-round">Next round &rarr;</button>`
        }
        <button data-action="start-fast-money">Fast Money &rarr;</button>
      </div>
    `;
  }
  return '';
}

function roundPanel(state) {
  const round = state.rounds[state.currentRoundIdx];
  if (!round) return '<div class="panel"><h2>No round loaded</h2></div>';

  const N = state.currentRoundIdx + 1;
  const playing = playingTeamsForRound(state, N);
  const sitting = sittingTeamsForRound(state, N);

  return `
    <div class="panel">
      <div class="host-meta">
        <div class="pill gold">Round ${N} / ${state.rounds.length}</div>
        <div class="pill">Pot: ${state.pot}</div>
        ${state.rotationOrder ? `
          <div class="pill">Playing: ${escapeHtml(playing.map((id) => teamName(state, id)).join(' vs '))}</div>
          ${sitting.length > 0
            ? `<div class="pill">Sitting: ${escapeHtml(sitting.map((id) => teamName(state, id)).join(', '))}</div>`
            : ''}
        ` : ''}
      </div>
      <div class="host-question">${escapeHtml(round.question)}</div>
      ${faceoffSection(state)}
      ${answersSection(state, round)}
      ${strikeIndicator(state)}
      ${actionButtons(state)}
    </div>
  `;
}

function scorePanel(state) {
  return `
    <div class="panel">
      <h2>Scoreboard</h2>
      <div class="host-team-list">
        ${state.teams.map((t) => {
          const isControlling = state.controllingTeamId === t.id;
          const isStealing = state.stealingTeamId === t.id;
          const tag = isControlling ? ' (control)' : (isStealing ? ' (steal)' : '');
          const cls = isControlling ? 'controlling playing' : (isStealing ? 'playing' : '');
          return `
            <div class="host-team-row ${cls}">
              <span class="name">${escapeHtml(t.name)}${tag}</span>
              <input type="number" data-action="edit-score" data-team-id="${t.id}" value="${t.score}" />
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function questionsListPanel(state) {
  return `
    <div class="panel">
      <h2>All Questions</h2>
      <div class="host-questions-list">
        ${state.rounds.map((r, i) => {
          const isCurrent = i === state.currentRoundIdx;
          const isPast = i < state.currentRoundIdx;
          return `
            <div class="host-questions-row ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}">
              <span class="host-questions-num">${i + 1}</span>
              <span class="host-questions-text">${escapeHtml(r.question)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function navPanel(state) {
  const atFirst = state.currentRoundIdx === 0;
  const atLast = state.currentRoundIdx >= state.rounds.length - 1;
  return `
    <div class="panel">
      <h2>Navigation &amp; recovery</h2>
      <div class="button-row">
        <button data-action="prev-round" ${atFirst ? 'disabled' : ''}>&larr; Prev round</button>
        <button data-action="next-round" ${atLast ? 'disabled' : ''}>Next round &rarr;</button>
        <button data-action="undo">Undo last action</button>
        <button data-action="reset-round">Reset current round</button>
        <button class="danger" data-action="end-game-now">End game now</button>
        <button class="danger" data-action="new-game">New game (reset all)</button>
        <button class="primary" data-action="start-fast-money">Fast Money &rarr;</button>
      </div>
    </div>
  `;
}

function fmScore(state, teamId) {
  const fm = state.fastMoney || {};
  return (fm.questions || []).reduce((sum, q, qIdx) => {
    const key = `${qIdx}_${teamId}`;
    if (!(fm.pointsRevealed || {})[key]) return sum;
    const sel = (fm.selections || {})[key];
    if (sel === undefined || sel === -1) return sum;
    return sum + (q.answers[sel]?.points || 0);
  }, 0);
}

function fastMoneyWinnerHTML(state) {
  const scores = state.teams.map((t) => ({ team: t, score: fmScore(state, t.id) }))
    .sort((a, b) => b.score - a.score);
  return `
    <div class="host">
      <h1>FAST MONEY &mdash; RESULTS</h1>
      <div class="panel">
        <div class="final-scores">
          ${scores.map((s, i) => `
            <div class="row ${i === 0 ? 'winner' : ''}">
              <span>${escapeHtml(s.team.name)}${i === 0 ? ' — WINNER' : ''}</span>
              <span class="points">${s.score}</span>
            </div>
          `).join('')}
        </div>
        <div class="button-row" style="margin-top:16px;">
          <button class="danger" data-action="new-game">New Game (reset all)</button>
        </div>
      </div>
      <div class="sync-pill" id="sync-pill"></div>
    </div>
  `;
}

function fastMoneyHostHTML(state) {
  const fm = {
    questions: [],
    typedAnswers: {},
    selections: {},
    answerRevealed: {},
    pointsRevealed: {},
    ...state.fastMoney
  };
  return `
    <div class="host">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
        <h1>FAST MONEY &mdash; HOST</h1>
        <button class="primary" data-action="end-fast-money">End Game &rarr; Show Winner</button>
      </div>
      <div class="panel" style="margin-bottom:14px;">
        <h2>Running Totals</h2>
        <div style="display:flex; gap:24px; flex-wrap:wrap;">
          ${state.teams.map((t) => `
            <div style="font-size:22px;">
              <span style="color:var(--muted);">${escapeHtml(t.name)}:</span>
              <span style="color:var(--gold); margin-left:8px;">${fmScore(state, t.id)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ${fm.questions.map((q, qIdx) => `
        <div class="panel fm-host-question-panel">
          <div class="fm-host-q-label">Q${qIdx + 1}: ${escapeHtml(q.question)}</div>
          ${state.teams.map((t) => {
            const key = `${qIdx}_${t.id}`;
            const sel = fm.selections[key];
            const typed = fm.typedAnswers[key] || '';
            const ansRevealed = fm.answerRevealed[key];
            const ptsRevealed = fm.pointsRevealed[key];
            const selectedAnswer = sel !== undefined && sel !== -1 ? q.answers[sel] : null;
            const noMatch = sel === -1;
            const canRevealAnswer = typed.trim() !== '' && sel !== undefined && !ansRevealed;
            return `
              <div class="fm-host-team-row">
                <div class="fm-host-team-name">${escapeHtml(t.name)}</div>
                <div class="fm-host-entry-row">
                  <input
                    type="text"
                    class="fm-typed-input"
                    placeholder="Their answer..."
                    value="${escapeHtml(typed)}"
                    data-action="type-fm-answer"
                    data-qidx="${qIdx}"
                    data-team-id="${t.id}"
                    ${ansRevealed ? 'disabled' : ''}
                  />
                </div>
                <div style="font-size:13px; color:var(--muted); margin-bottom:4px; font-family:system-ui;">Points mapping:</div>
                <div class="fm-host-answer-btns">
                  ${q.answers.map((a, aIdx) => `
                    <button
                      class="fm-answer-btn ${sel === aIdx ? 'selected' : ''}"
                      data-action="select-fm-answer"
                      data-qidx="${qIdx}"
                      data-team-id="${t.id}"
                      data-aidx="${aIdx}"
                      ${ansRevealed ? 'disabled' : ''}
                    >${escapeHtml(a.text)} (${a.points})</button>
                  `).join('')}
                  <button
                    class="fm-answer-btn fm-no-match-btn ${noMatch ? 'selected' : ''}"
                    data-action="select-fm-answer"
                    data-qidx="${qIdx}"
                    data-team-id="${t.id}"
                    data-aidx="-1"
                    ${ansRevealed ? 'disabled' : ''}
                  >No Match</button>
                </div>
                <div class="fm-host-reveal-row">
                  <span class="fm-host-selection-label">
                    ${sel === undefined ? '<span style="color:var(--muted);">no points mapping</span>' :
                      noMatch ? '<span style="color:var(--red);">NO MATCH &mdash; 0pts</span>' :
                      `<span style="color:var(--gold);">${escapeHtml(selectedAnswer.text)} &mdash; ${selectedAnswer.points}pts</span>`}
                  </span>
                  <button
                    data-action="reveal-fm-answer"
                    data-qidx="${qIdx}"
                    data-team-id="${t.id}"
                    ${!canRevealAnswer ? 'disabled' : ''}
                  >Reveal Answer &#9654;</button>
                  <button
                    data-action="reveal-fm-points"
                    data-qidx="${qIdx}"
                    data-team-id="${t.id}"
                    ${!ansRevealed || ptsRevealed ? 'disabled' : ''}
                  >Reveal Points &#9654;</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
      <div class="sync-pill" id="sync-pill"></div>
    </div>
  `;
}

function mainHTML(state) {
  return `
    <div class="host">
      <h1>FAMILY FEUD &mdash; HOST <span class="host-mode">${state.mode}</span></h1>
      <div class="host-grid">
        ${roundPanel(state)}
        ${scorePanel(state)}
      </div>
      ${navPanel(state)}
      ${questionsListPanel(state)}
      <div class="sync-pill" id="sync-pill"></div>
    </div>
  `;
}

function render(state) {
  const root = document.getElementById('app');
  if (state.fastMoneyActive) {
    if (state.fastMoneyComplete) {
      root.innerHTML = fastMoneyWinnerHTML(state);
      return;
    }
    if (document.activeElement && document.activeElement.matches('input[data-action="type-fm-answer"]')) {
      return;
    }
    root.innerHTML = fastMoneyHostHTML(state);
    return;
  }
  if (state.mode === 'setup') {
    const checked = document.querySelector('input[name="team-count"]:checked');
    const teamCount = checked ? parseInt(checked.value, 10) : 3;
    root.innerHTML = setupHTML(teamCount);
    return;
  }
  if (state.mode === 'gameOver') {
    root.innerHTML = gameOverHTML(state);
    return;
  }
  root.innerHTML = mainHTML(state);
}

function updateSyncPill(connected) {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  pill.textContent = connected ? 'board: connected' : 'board: disconnected';
  pill.className = `sync-pill ${connected ? 'connected' : 'disconnected'}`;
}

/* ============================================================
   AUDIO
   ============================================================ */

const sounds = {
  correct: new Audio('family-feud-correct.mp3'),
  incorrect: new Audio('family-feud-incorrect.mp3'),
  win: new Audio('family-feud-win.mp3'),
};
sounds.correct.volume = 0.2;
sounds.incorrect.volume = 0.2;
sounds.win.volume = 0.2;

function playSound(name) {
  const audio = sounds[name];
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function startGame() {
  const checked = document.querySelector('input[name="team-count"]:checked');
  const teamCount = checked ? parseInt(checked.value, 10) : 3;
  const names = [];
  for (let i = 1; i <= teamCount; i++) {
    names.push(document.getElementById(`team-${i}`)?.value || '');
  }
  let rounds;
  try {
    rounds = await loadQuestions();
  } catch (e) {
    alert(`Failed to load questions.json: ${e.message}`);
    return;
  }
  const teams = names.map((n, i) => ({
    id: `t${i + 1}`,
    name: (n || '').trim() || `Team ${i + 1}`,
    score: 0
  }));
  // For 2 teams, rotation is trivial — auto-lock so we skip the round-1 raise-hand step.
  const rotationOrder = teamCount === 2 ? teams.map((t) => t.id) : null;
  setState({
    teams,
    rounds,
    currentRoundIdx: 0,
    revealed: new Array(rounds[0].answers.length).fill(false),
    strikes: 0,
    pot: 0,
    controllingTeamId: null,
    stealingTeamId: null,
    rotationOrder,
    faceoffFirstPick: null,
    mode: 'faceoff'
  });
  playSound('win');
}

function pickFaceoffTeam(teamId) {
  const state = getState();
  if (state.faceoffFirstPick === null || state.faceoffFirstPick === undefined) {
    setState({ faceoffFirstPick: teamId });
    return;
  }
  if (state.faceoffFirstPick === teamId) return;
  const first = state.faceoffFirstPick;
  const second = teamId;
  const remaining = state.teams
    .filter((t) => t.id !== first && t.id !== second)
    .map((t) => t.id);
  setState({
    rotationOrder: [first, second, ...remaining],
    faceoffFirstPick: null
  });
}

function resetFaceoffPick() {
  setState({ faceoffFirstPick: null });
}

function pickFaceoffWinner(teamId) {
  const state = getState();
  const N = state.currentRoundIdx + 1;
  const playing = playingTeamsForRound(state, N);
  if (!playing.includes(teamId)) return;
  const stealer = playing.find((id) => id !== teamId);
  setState({
    controllingTeamId: teamId,
    stealingTeamId: stealer,
    mode: 'play'
  });
}

function revealAnswer(idx) {
  const state = getState();
  if (state.revealed[idx]) return;
  const round = state.rounds[state.currentRoundIdx];
  const points = round.answers[idx].points;
  const newRevealed = [...state.revealed];
  newRevealed[idx] = true;
  setState({
    revealed: newRevealed,
    pot: state.pot + points
  });
  playSound('correct');
}

function addStrike() {
  const state = getState();
  if (state.mode !== 'play') return;
  playSound('incorrect');
  const newStrikes = state.strikes + 1;
  setState({
    strikes: newStrikes,
    mode: newStrikes >= 3 ? 'steal' : 'play'
  });
}

function triggerSteal() {
  const state = getState();
  if (state.mode !== 'play') return;
  setState({ mode: 'steal' });
}

function endRoundAwardControllers() {
  const state = getState();
  const teams = state.teams.map((t) =>
    t.id === state.controllingTeamId ? { ...t, score: t.score + state.pot } : t
  );
  setState({ teams, mode: 'roundEnd' });
}

function stealCorrect() {
  const state = getState();
  const teams = state.teams.map((t) =>
    t.id === state.stealingTeamId ? { ...t, score: t.score + state.pot } : t
  );
  setState({ teams, mode: 'roundEnd' });
}

function stealFailed() {
  const state = getState();
  playSound('incorrect');
  setState({ strikeFlashCount: (state.strikeFlashCount || 0) + 1 });

  setTimeout(() => {
    const s = getState();
    const teams = s.teams.map((t) =>
      t.id === s.controllingTeamId ? { ...t, score: t.score + s.pot } : t
    );
    setState({ teams, mode: 'roundEnd' });
  }, 1000);
}

function goToRound(idx) {
  const state = getState();
  if (idx < 0) return;
  if (idx >= state.rounds.length) {
    setState({ mode: 'gameOver' });
    return;
  }
  const round = state.rounds[idx];
  setState({
    currentRoundIdx: idx,
    revealed: new Array(round.answers.length).fill(false),
    strikes: 0,
    pot: 0,
    controllingTeamId: null,
    stealingTeamId: null,
    mode: 'faceoff',
    faceoffFirstPick: null
  });
}

function resetCurrentRound() {
  const state = getState();
  goToRound(state.currentRoundIdx);
}

function endGame() {
  setState({ mode: 'gameOver' });
  playSound('win');
}

function endGameNow() {
  const state = getState();
  if (state.mode === 'gameOver') return;
  const midRound = state.mode === 'play' || state.mode === 'steal' || state.mode === 'faceoff';
  if (midRound && state.pot > 0) {
    if (!confirm(`End game now? The current round's pot of ${state.pot} will be forfeited (no team gets it).`)) return;
  } else if (midRound) {
    if (!confirm('End game now and skip remaining rounds?')) return;
  }
  setState({ mode: 'gameOver' });
  playSound('win');
}

function newGame() {
  if (!confirm('Reset everything and return to setup?')) return;
  resetAll();
}

let fastMoneyQuestionsCache = null;

async function startFastMoney() {
  if (!fastMoneyQuestionsCache) {
    try {
      const res = await fetch('data/fast-money.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fastMoneyQuestionsCache = await res.json();
    } catch (e) {
      alert(`Failed to load fast-money.json: ${e.message}`);
      return;
    }
  }
  setState({
    fastMoneyActive: true,
    fastMoney: {
      questions: fastMoneyQuestionsCache,
      typedAnswers: {},
      selections: {},
      answerRevealed: {},
      pointsRevealed: {}
    }
  });
}

function setFastMoneyTypedAnswer(qIdx, teamId, text) {
  const state = getState();
  const key = `${qIdx}_${teamId}`;
  if (state.fastMoney.answerRevealed[key]) return;
  setState({
    fastMoney: {
      ...state.fastMoney,
      typedAnswers: { ...state.fastMoney.typedAnswers, [key]: text }
    }
  });
}

function selectFastMoneyAnswer(qIdx, teamId, answerIdx) {
  const state = getState();
  const key = `${qIdx}_${teamId}`;
  if (state.fastMoney.answerRevealed[key]) return;
  const current = state.fastMoney.selections[key];
  const newSelections = { ...state.fastMoney.selections };
  if (current === answerIdx) {
    delete newSelections[key];
  } else {
    newSelections[key] = answerIdx;
  }
  setState({ fastMoney: { ...state.fastMoney, selections: newSelections } });
}

function revealFastMoneyAnswer(qIdx, teamId) {
  const state = getState();
  const key = `${qIdx}_${teamId}`;
  setState({
    fastMoney: {
      ...state.fastMoney,
      answerRevealed: { ...state.fastMoney.answerRevealed, [key]: true }
    }
  });
}

function revealFastMoneyPoints(qIdx, teamId) {
  const state = getState();
  const key = `${qIdx}_${teamId}`;
  setState({
    fastMoney: {
      ...state.fastMoney,
      pointsRevealed: { ...state.fastMoney.pointsRevealed, [key]: true }
    }
  });
}

function endFastMoney() {
  setState({ fastMoneyComplete: true });
  playSound('win');
}

function editScore(teamId, newScore) {
  const state = getState();
  const teams = state.teams.map((t) =>
    t.id === teamId ? { ...t, score: Number.isFinite(newScore) ? newScore : 0 } : t
  );
  setState({ teams });
}

/* ============================================================
   EVENT WIRING
   ============================================================ */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.tagName === 'INPUT') return;
  const action = btn.dataset.action;
  switch (action) {
    case 'start-game': startGame(); break;
    case 'pick-faceoff-team': pickFaceoffTeam(btn.dataset.teamId); break;
    case 'reset-faceoff-pick': resetFaceoffPick(); break;
    case 'pick-faceoff-winner': pickFaceoffWinner(btn.dataset.teamId); break;
    case 'reveal': revealAnswer(parseInt(btn.dataset.idx, 10)); break;
    case 'strike': addStrike(); break;
    case 'trigger-steal': triggerSteal(); break;
    case 'end-round-controllers': endRoundAwardControllers(); break;
    case 'steal-correct': stealCorrect(); break;
    case 'steal-failed': stealFailed(); break;
    case 'next-round': goToRound(getState().currentRoundIdx + 1); break;
    case 'prev-round': goToRound(getState().currentRoundIdx - 1); break;
    case 'undo': undo(); break;
    case 'reset-round': resetCurrentRound(); break;
    case 'end-game': endGame(); break;
    case 'end-game-now': endGameNow(); break;
    case 'new-game': newGame(); break;
    case 'start-fast-money': startFastMoney(); break;
    case 'select-fm-answer':
      selectFastMoneyAnswer(+btn.dataset.qidx, btn.dataset.teamId, +btn.dataset.aidx); break;
    case 'reveal-fm-answer':
      revealFastMoneyAnswer(+btn.dataset.qidx, btn.dataset.teamId); break;
    case 'reveal-fm-points':
      revealFastMoneyPoints(+btn.dataset.qidx, btn.dataset.teamId); break;
    case 'end-fast-money': endFastMoney(); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.matches('input[data-action="type-fm-answer"]')) {
    setFastMoneyTypedAnswer(+e.target.dataset.qidx, e.target.dataset.teamId, e.target.value);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('input[data-action="edit-score"]')) {
    const teamId = e.target.dataset.teamId;
    const newScore = parseInt(e.target.value, 10);
    editScore(teamId, newScore);
    return;
  }
  if (e.target.matches('input[name="team-count"]')) {
    const newCount = parseInt(e.target.value, 10);
    const container = document.getElementById('team-inputs');
    if (!container) return;
    const existing = {};
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`team-${i}`);
      if (el) existing[i] = el.value;
    }
    container.innerHTML = teamInputsHTML(newCount, existing);
  }
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    addStrike();
  }
});

subscribe(render);
onPeerStatus(updateSyncPill);
