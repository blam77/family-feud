const STORAGE_KEY = 'feud-state';
const channel = new BroadcastChannel('feud');

const initialState = () => ({
  teams: [],
  rotationOrder: null,
  rounds: [],
  currentRoundIdx: 0,
  revealed: [],
  strikes: 0,
  pot: 0,
  controllingTeamId: null,
  stealingTeamId: null,
  mode: 'setup',
  fastMoneyActive: false,
  fastMoneyComplete: false,
  fastMoney: {
    questions: [],
    typedAnswers: {},
    selections: {},
    answerRevealed: {},
    pointsRevealed: {}
  }
});

let state = loadFromStorage() || initialState();
let prevState = null;
const subscribers = new Set();

let peerLastSeen = 0;
const peerListeners = new Set();

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notifySubscribers() {
  subscribers.forEach((fn) => fn(state));
}

export function getState() {
  return state;
}

export function setState(partial) {
  prevState = structuredClone(state);
  state = { ...state, ...partial };
  saveToStorage();
  channel.postMessage({ type: 'state', state });
  notifySubscribers();
}

export function undo() {
  if (!prevState) return false;
  state = prevState;
  prevState = null;
  saveToStorage();
  channel.postMessage({ type: 'state', state });
  notifySubscribers();
  return true;
}

export function resetAll() {
  prevState = structuredClone(state);
  state = initialState();
  saveToStorage();
  channel.postMessage({ type: 'state', state });
  notifySubscribers();
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

export function onPeerStatus(fn) {
  peerListeners.add(fn);
  fn(isPeerConnected());
  return () => peerListeners.delete(fn);
}

export function isPeerConnected() {
  return Date.now() - peerLastSeen < 3000;
}

channel.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'state') {
    state = msg.state;
    saveToStorage();
    notifySubscribers();
    peerLastSeen = Date.now();
    peerListeners.forEach((fn) => fn(true));
  } else if (msg.type === 'heartbeat') {
    peerLastSeen = Date.now();
    peerListeners.forEach((fn) => fn(true));
  } else if (msg.type === 'request-state') {
    channel.postMessage({ type: 'state', state });
  }
});

setInterval(() => {
  channel.postMessage({ type: 'heartbeat' });
  peerListeners.forEach((fn) => fn(isPeerConnected()));
}, 1000);

channel.postMessage({ type: 'request-state' });
