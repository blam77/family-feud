import { getState, subscribe, onPeerStatus } from './state.js';
import { isPlayingThisRound } from './rotation.js';

let lastStrikes = -1;
let bannerStartedAt = 0;
let bannerHideTimer = null;
let prevMode = null;
let prevRevealed = [];

const BANNER_MODES = new Set(['steal', 'faceoff']);
const BANNER_DURATION_MS = 5000;

const LOGO_PATH = 'Family-Feud-Logo-500x281.png';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function teamById(state, id) {
  return state.teams.find((t) => t.id === id);
}

function teamClasses(state, teamId) {
  const classes = [];
  if (state.controllingTeamId === teamId) classes.push('playing', 'controlling');
  else if (state.stealingTeamId === teamId) classes.push('playing');
  else if (isPlayingThisRound(state, teamId)) classes.push('playing');
  return classes.join(' ');
}

function renderSlot(answer, idx, isRevealed, isJustFlipped) {
  if (!isRevealed) {
    return `<div class="slot hidden-slot"><div class="slot-number">${idx + 1}</div></div>`;
  }
  const extraClass = isJustFlipped ? ' just-flipped' : '';
  return `
    <div class="slot revealed${extraClass}">
      <div class="answer-text">${escapeHtml(answer.text)}</div>
      <div class="answer-points">${answer.points}</div>
    </div>
  `;
}

function renderModeBanner(state) {
  if (!BANNER_MODES.has(state.mode)) return '';
  if (state.mode === 'faceoff') {
    return `
      <div class="banner-overlay">
        <div class="banner-title">FACE-OFF</div>
        <div class="banner-sub">Round ${state.currentRoundIdx + 1}</div>
      </div>
    `;
  }
  if (state.mode === 'steal') {
    const elapsed = bannerStartedAt ? Date.now() - bannerStartedAt : 0;
    if (elapsed > BANNER_DURATION_MS) return '';
    const style = `style="animation-delay: -${elapsed}ms;"`;
    const team = teamById(state, state.stealingTeamId);
    return `
      <div class="banner-overlay banner-fade" ${style}>
        <div class="banner-title">STEAL</div>
        <div class="banner-sub">${escapeHtml(team?.name || '???')}</div>
      </div>
    `;
  }
  return '';
}

function renderGameOver(state) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  return `
    <div class="board">
      <div class="game-over">
        <img class="feud-logo feud-logo-large" src="${LOGO_PATH}" alt="Family Feud" />
        <h1>FINAL SCORES</h1>
        <div class="final-scores">
          ${sorted.map((t, i) => `
            <div class="row ${i === 0 ? 'winner' : ''}">
              <span>${escapeHtml(t.name)}${i === 0 ? ' — WINNER' : ''}</span>
              <span class="points">${t.score}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="sync-pill" id="sync-pill"></div>
  `;
}

function renderWaiting(message) {
  return `
    <div class="banner-overlay" style="background: var(--bg);">
      <img class="feud-logo feud-logo-large" src="${LOGO_PATH}" alt="Family Feud" />
      <div class="banner-sub">${escapeHtml(message)}</div>
    </div>
    <div class="sync-pill" id="sync-pill"></div>
  `;
}

function renderBoard(state, newlyRevealed) {
  if (state.mode === 'setup' || !state.teams.length || !state.rounds.length) {
    return renderWaiting('Waiting for host to start...');
  }

  if (state.mode === 'gameOver') {
    return renderGameOver(state);
  }

  const round = state.rounds[state.currentRoundIdx];
  if (!round) {
    return renderWaiting('No round loaded');
  }

  return `
    <div class="board">
      <div class="board-header">
        <div class="team-scores">
          ${state.teams.map((t) => `
            <div class="team-score ${teamClasses(state, t.id)}">
              <span>${escapeHtml(t.name)}</span>
              <span class="score-num">${t.score}</span>
            </div>
          `).join('')}
        </div>
        <div class="pot">
          <div class="pot-label">ON THE BOARD</div>
          <div class="pot-value">${state.pot}</div>
        </div>
      </div>
      ${state.mode !== 'faceoff' ? `<div class="question">${escapeHtml(round.question)}</div>` : ''}
      <div class="board-main">
        <div class="answer-grid">
          ${round.answers.map((a, i) => renderSlot(a, i, state.revealed[i], newlyRevealed.has(i))).join('')}
        </div>
      </div>
      <div class="strike-tracker">
        ${[0, 1, 2].map((i) =>
          `<div class="strike-box ${i < state.strikes ? 'lit' : ''}">X</div>`
        ).join('')}
      </div>
    </div>
    <div class="strike-flash" id="strike-flash"></div>
    <div class="strike-x-overlay" id="strike-x"><div class="x-mark">X</div></div>
    ${renderModeBanner(state)}
    <div class="sync-pill" id="sync-pill"></div>
  `;
}

function fireStrike() {
  const flash = document.getElementById('strike-flash');
  const x = document.getElementById('strike-x');
  if (!flash || !x) return;
  flash.classList.remove('firing');
  x.classList.remove('firing');
  void flash.offsetWidth;
  void x.offsetWidth;
  flash.classList.add('firing');
  x.classList.add('firing');
}

function render(state) {
  const isBanner = BANNER_MODES.has(state.mode);
  const wasBanner = BANNER_MODES.has(prevMode);
  if (isBanner && state.mode !== prevMode) {
    bannerStartedAt = Date.now();
    if (bannerHideTimer) clearTimeout(bannerHideTimer);
    if (state.mode === 'steal') {
      bannerHideTimer = setTimeout(() => {
        bannerHideTimer = null;
        render(getState());
      }, BANNER_DURATION_MS + 100);
    }
  } else if (!isBanner && wasBanner) {
    if (bannerHideTimer) {
      clearTimeout(bannerHideTimer);
      bannerHideTimer = null;
    }
    bannerStartedAt = 0;
  }
  prevMode = state.mode;

  const newlyRevealed = new Set(
    (state.revealed || []).reduce((acc, val, i) => {
      if (val && !prevRevealed[i]) acc.push(i);
      return acc;
    }, [])
  );
  prevRevealed = [...(state.revealed || [])];

  const root = document.getElementById('app');
  root.innerHTML = renderBoard(state, newlyRevealed);

  const becameMoreStrikes = lastStrikes !== -1 && state.strikes > lastStrikes;
  lastStrikes = state.strikes;
  if (becameMoreStrikes) fireStrike();
}

function updateSyncPill(connected) {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  pill.textContent = connected ? 'host: connected' : 'host: disconnected';
  pill.className = `sync-pill ${connected ? 'connected' : 'disconnected'}`;
}

subscribe(render);
onPeerStatus(updateSyncPill);
