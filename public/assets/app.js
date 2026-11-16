const SECRET = 'mmcdoc';
const POLL_MS = 2000;
const CLIENT_KEY = 'mmc_doc_client_id';

const HOLD_MS = 900;
const TAP_NEED = 7;

const state = {
  buffer: '',
  session: null,
  lastId: 0,
  pollTimer: null,
  holdTimer: null,
  revisionTaps: 0,
  revisionTapTimer: null,
  clientId: null,
};

state.clientId = getClientId();

function createClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `c_${window.crypto.randomUUID().replace(/-/g, '')}`.slice(0, 64);
  }
  return (
    'c_' +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  ).slice(0, 64);
}

function getClientId() {
  try {
    let id = String(localStorage.getItem(CLIENT_KEY) || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    if (id.length < 8) {
      id = createClientId();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return createClientId();
  }
}

const gate = document.getElementById('gate');
const roomEl = document.getElementById('room');
const joinForm = document.getElementById('join-form');
const createForm = document.getElementById('create-form');
const sendForm = document.getElementById('send-form');
const messagesEl = document.getElementById('messages');
const roomTitle = document.getElementById('room-title');
const joinError = document.getElementById('join-error');
const createError = document.getElementById('create-error');
const sendError = document.getElementById('send-error');

function show(el) {
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
}

function hide(el) {
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
}

function setError(el, message) {
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function errorMessage(code) {
  const map = {
    invalid_create_key: 'Create key rejected.',
    invalid_code: 'Use 3–64 letters, numbers, _ or -.',
    invalid_password: 'Access phrase too short.',
    code_taken: 'That reference id is already used.',
    not_found: 'Reference not found.',
    unauthorized: 'Access phrase rejected.',
    invalid_sender: 'Display name required.',
    invalid_body: 'Message required.',
    invalid_client: 'Device id missing. Refresh and try again.',
    deleted: 'This session was deleted.',
    server_error: 'Temporary server issue.',
  };
  return map[code] || 'Request failed.';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: 'server_error' };
  }
  return { res, data };
}

function openGate() {
  show(gate);
}

function closeGate() {
  hide(gate);
  setError(joinError, '');
  setError(createError, '');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  joinForm.classList.toggle('hidden', name !== 'join');
  createForm.classList.toggle('hidden', name !== 'create');
}

function isMine(msg) {
  if (!state.session) return false;
  if (msg.client_id && state.clientId) {
    return msg.client_id === state.clientId;
  }
  return msg.sender_name === state.session.senderName;
}

function renderMessage(msg) {
  const mine = isMine(msg);
  const wrap = document.createElement('article');
  wrap.className = mine ? 'msg mine' : 'msg theirs';
  wrap.innerHTML = '<p class="msg-name"></p><p class="msg-body"></p>';
  wrap.querySelector('.msg-name').textContent = mine
    ? `You · ${msg.sender_name}`
    : msg.sender_name;
  wrap.querySelector('.msg-body').textContent = msg.body;
  messagesEl.appendChild(wrap);
}

function scrollMessages() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function pollMessages(forceScroll) {
  if (!state.session) return;
  const params = new URLSearchParams({
    code: state.session.code,
    password: state.session.password,
    after_id: String(state.lastId),
  });
  const { res, data } = await api(`/api/messages?${params.toString()}`, {
    method: 'GET',
    headers: {},
  });
  if (res.status === 404 || data.error === 'not_found') {
    leaveRoom();
    return;
  }
  if (!res.ok || !data.ok) return;
  const list = data.messages || [];
  if (!list.length) return;
  for (const msg of list) {
    renderMessage(msg);
    state.lastId = Math.max(state.lastId, Number(msg.id));
  }
  if (forceScroll || list.length) scrollMessages();
}

async function clearChat() {
  if (!state.session) return;
  const ok = window.confirm('Clear all notes in this session? The room stays open.');
  if (!ok) return;
  setError(sendError, '');
  const { res, data } = await api('/api/messages/clear', {
    method: 'POST',
    body: JSON.stringify({
      code: state.session.code,
      password: state.session.password,
    }),
  });
  if (!res.ok || !data.ok) {
    setError(sendError, errorMessage(data.error));
    return;
  }
  state.lastId = 0;
  messagesEl.innerHTML = '';
}

async function enterRoom(session) {
  state.session = session;
  state.lastId = 0;
  messagesEl.innerHTML = '';
  roomTitle.textContent = session.code;
  closeGate();
  show(roomEl);
  await pollMessages(true);
  stopPolling();
  state.pollTimer = setInterval(() => {
    pollMessages(false);
  }, POLL_MS);
}

function leaveRoom() {
  stopPolling();
  state.session = null;
  state.lastId = 0;
  messagesEl.innerHTML = '';
  hide(roomEl);
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = (event.target && event.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.isComposing) return;

  const key = event.key;
  if (key.length !== 1) {
    if (key === 'Escape') {
      if (!gate.classList.contains('hidden')) closeGate();
      else if (!roomEl.classList.contains('hidden')) leaveRoom();
    }
    return;
  }

  state.buffer = (state.buffer + key.toLowerCase()).slice(-SECRET.length);
  if (state.buffer === SECRET) {
    state.buffer = '';
    openGate();
  }
});

function bindOutsideClose(overlay, onOutside) {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) onOutside();
  });
}

bindOutsideClose(gate, closeGate);
bindOutsideClose(roomEl, leaveRoom);

const brandTitle = document.getElementById('brand-title');
function clearHold() {
  if (state.holdTimer) {
    clearTimeout(state.holdTimer);
    state.holdTimer = null;
  }
}

brandTitle.addEventListener('pointerdown', (event) => {
  if (event.button != null && event.button !== 0) return;
  clearHold();
  state.holdTimer = setTimeout(() => {
    state.holdTimer = null;
    openGate();
  }, HOLD_MS);
});

['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
  brandTitle.addEventListener(type, clearHold);
});

const revisionTap = document.getElementById('revision-tap');
revisionTap.addEventListener('click', () => {
  state.revisionTaps += 1;
  if (state.revisionTapTimer) clearTimeout(state.revisionTapTimer);
  state.revisionTapTimer = setTimeout(() => {
    state.revisionTaps = 0;
  }, 2500);
  if (state.revisionTaps >= TAP_NEED) {
    state.revisionTaps = 0;
    openGate();
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.getElementById('close-gate').addEventListener('click', closeGate);
document.getElementById('leave-room').addEventListener('click', leaveRoom);
document.getElementById('clear-chat').addEventListener('click', () => {
  clearChat();
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(joinError, '');
  const form = new FormData(joinForm);
  const payload = {
    sender_name: String(form.get('sender_name') || '').trim(),
    code: String(form.get('code') || '').trim(),
    password: String(form.get('password') || ''),
  };
  const { res, data } = await api('/api/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code: payload.code, password: payload.password }),
  });
  if (!res.ok || !data.ok) {
    setError(joinError, errorMessage(data.error));
    return;
  }
  await enterRoom({
    senderName: payload.sender_name,
    code: data.code,
    password: payload.password,
  });
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(createError, '');
  const form = new FormData(createForm);
  const payload = {
    sender_name: String(form.get('sender_name') || '').trim(),
    code: String(form.get('code') || '').trim(),
    password: String(form.get('password') || ''),
    create_key: String(form.get('create_key') || ''),
  };
  const { res, data } = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      code: payload.code,
      password: payload.password,
      create_key: payload.create_key,
    }),
  });
  if (!res.ok || !data.ok) {
    setError(createError, errorMessage(data.error));
    return;
  }
  await enterRoom({
    senderName: payload.sender_name,
    code: data.code,
    password: payload.password,
  });
});

sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.session) return;
  setError(sendError, '');
  const input = document.getElementById('message-input');
  const body = String(input.value || '').trim();
  if (!body) return;
  state.clientId = getClientId();
  const { res, data } = await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      code: state.session.code,
      password: state.session.password,
      sender_name: state.session.senderName,
      client_id: state.clientId,
      body,
    }),
  });
  if (!res.ok || !data.ok) {
    setError(sendError, errorMessage(data.error));
    return;
  }
  input.value = '';
  if (data.message) {
    renderMessage(data.message);
    state.lastId = Math.max(state.lastId, Number(data.message.id));
    scrollMessages();
  }
});
