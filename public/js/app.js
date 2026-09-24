// Application State
let state = {
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  messages: [],
  filter: 'all',
  searchQuery: '',
  pollingTimer: null,
};

// DOM Elements
const elements = {
  totalChatsCount: document.getElementById('totalChatsCount'),
  humanChatsCount: document.getElementById('humanChatsCount'),
  botChatsCount: document.getElementById('botChatsCount'),
  conversationsList: document.getElementById('conversationsList'),
  searchInput: document.getElementById('searchInput'),
  filterButtons: document.querySelectorAll('.filter-btn'),
  noSelectionState: document.getElementById('noSelectionState'),
  activeChatView: document.getElementById('activeChatView'),
  activeAvatar: document.getElementById('activeAvatar'),
  activeUserName: document.getElementById('activeUserName'),
  activePlatformBadge: document.getElementById('activePlatformBadge'),
  activeUserId: document.getElementById('activeUserId'),
  activeModeIndicator: document.getElementById('activeModeIndicator'),
  toggleModeBtn: document.getElementById('toggleModeBtn'),
  messagesContainer: document.getElementById('messagesContainer'),
  composerForm: document.getElementById('composerForm'),
  composerInput: document.getElementById('composerInput'),
  composerBanner: document.getElementById('composerBanner'),
  composerBannerText: document.getElementById('composerBannerText'),
  openSimBtn: document.getElementById('openSimBtn'),
  closeSimBtn: document.getElementById('closeSimBtn'),
  cancelSimBtn: document.getElementById('cancelSimBtn'),
  simModal: document.getElementById('simModal'),
  simForm: document.getElementById('simForm'),
  simPlatform: document.getElementById('simPlatform'),
  simUserName: document.getElementById('simUserName'),
  simUserId: document.getElementById('simUserId'),
  simText: document.getElementById('simText'),
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchConversations();
  startPolling();
});

function setupEventListeners() {
  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderConversationsList();
  });

  // Filter buttons
  elements.filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      elements.filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderConversationsList();
    });
  });

  // Composer Form
  elements.composerForm.addEventListener('submit', handleSendReply);
  elements.composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.composerForm.dispatchEvent(new Event('submit'));
    }
  });

  // Toggle Mode Button
  elements.toggleModeBtn.addEventListener('click', handleToggleMode);

  // Simulator Modal
  elements.openSimBtn.addEventListener('click', () => elements.simModal.classList.remove('hidden'));
  elements.closeSimBtn.addEventListener('click', () => elements.simModal.classList.add('hidden'));
  elements.cancelSimBtn.addEventListener('click', () => elements.simModal.classList.add('hidden'));
  elements.simForm.addEventListener('submit', handleSimulateMessage);

  // Quick prompt chips
  document.querySelectorAll('.btn-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      elements.simText.value = chip.dataset.prompt;
    });
  });
}

function startPolling() {
  if (state.pollingTimer) clearInterval(state.pollingTimer);
  state.pollingTimer = setInterval(() => {
    fetchConversations(false);
    if (state.activeConversationId) {
      fetchMessages(state.activeConversationId, false);
    }
  }, 3000);
}

// ==========================================
// API Calls
// ==========================================

async function fetchConversations(showLoading = true) {
  try {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    if (data.success) {
      state.conversations = data.conversations || [];
      updateStats();
      renderConversationsList();
    }
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
  }
}

async function fetchMessages(conversationId, autoScroll = true) {
  try {
    const res = await fetch(`/api/conversations/${conversationId}`);
    const data = await res.json();
    if (data.success) {
      state.activeConversation = data.conversation;
      state.messages = data.messages || [];
      updateActiveChatHeader();
      renderMessages(autoScroll);
    }
  } catch (error) {
    console.error(`Failed to fetch messages for convo #${conversationId}:`, error);
  }
}

async function handleSendReply(e) {
  e.preventDefault();
  const text = elements.composerInput.value.trim();
  if (!text || !state.activeConversationId) return;

  elements.composerInput.value = '';

  try {
    const res = await fetch(`/api/conversations/${state.activeConversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    if (data.success) {
      await fetchMessages(state.activeConversationId, true);
      await fetchConversations(false);
    } else {
      alert(`Error sending reply: ${data.error}`);
    }
  } catch (error) {
    console.error('Error sending reply:', error);
  }
}

async function handleToggleMode() {
  if (!state.activeConversationId || !state.activeConversation) return;

  const currentMode = state.activeConversation.mode;
  const newMode = currentMode === 'bot' ? 'human' : 'bot';

  try {
    const res = await fetch(`/api/conversations/${state.activeConversationId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    });

    const data = await res.json();
    if (data.success) {
      state.activeConversation.mode = newMode;
      updateActiveChatHeader();
      await fetchConversations(false);
      await fetchMessages(state.activeConversationId, true);
    }
  } catch (error) {
    console.error('Error toggling mode:', error);
  }
}

async function handleSimulateMessage(e) {
  e.preventDefault();
  const payload = {
    platform: elements.simPlatform.value,
    userName: elements.simUserName.value.trim(),
    externalUserId: elements.simUserId.value.trim(),
    text: elements.simText.value.trim(),
  };

  try {
    const res = await fetch('/api/simulate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      elements.simModal.classList.add('hidden');
      elements.simText.value = '';
      await fetchConversations();
    } else {
      alert(`Simulation error: ${data.error}`);
    }
  } catch (error) {
    console.error('Error simulating message:', error);
  }
}

// ==========================================
// UI Rendering
// ==========================================

function updateStats() {
  const total = state.conversations.length;
  const human = state.conversations.filter((c) => c.mode === 'human').length;
  const bot = state.conversations.filter((c) => c.mode === 'bot').length;

  elements.totalChatsCount.textContent = total;
  elements.humanChatsCount.textContent = human;
  elements.botChatsCount.textContent = bot;
}

function renderConversationsList() {
  let filtered = state.conversations;

  // Apply status filter
  if (state.filter === 'human') {
    filtered = filtered.filter((c) => c.mode === 'human');
  } else if (state.filter === 'bot') {
    filtered = filtered.filter((c) => c.mode === 'bot');
  }

  // Apply search query
  if (state.searchQuery) {
    filtered = filtered.filter(
      (c) =>
        (c.user_name && c.user_name.toLowerCase().includes(state.searchQuery)) ||
        (c.external_user_id && c.external_user_id.toLowerCase().includes(state.searchQuery)) ||
        (c.last_message && c.last_message.toLowerCase().includes(state.searchQuery))
    );
  }

  if (filtered.length === 0) {
    elements.conversationsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No conversations match your filter.</p>
      </div>
    `;
    return;
  }

  elements.conversationsList.innerHTML = filtered
    .map((c) => {
      const isSelected = state.activeConversationId === c.id;
      const initial = (c.user_name || 'U').charAt(0).toUpperCase();
      const platformIcon = c.platform === 'messenger' ? '⚡' : '✈️';
      const isHumanMode = c.mode === 'human';

      const timeAgo = formatTimeAgo(c.last_message_at || c.updated_at);

      return `
        <div class="convo-item ${isSelected ? 'selected' : ''}" onclick="selectConversation(${c.id})">
          <div class="convo-avatar">
            ${initial}
            <div class="platform-mini-icon ${c.platform}">
              ${platformIcon}
            </div>
          </div>
          <div class="convo-body">
            <div class="convo-top">
              <span class="convo-name">${escapeHtml(c.user_name || 'User')}</span>
              <span class="convo-time">${timeAgo}</span>
            </div>
            <div class="convo-preview">${escapeHtml(c.last_message || 'No messages yet')}</div>
            <div class="convo-badges">
              <span class="badge ${isHumanMode ? 'badge-human' : 'badge-bot'}">
                ${isHumanMode ? '👤 Human Needed' : '🤖 Bot Active'}
              </span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

window.selectConversation = function (id) {
  state.activeConversationId = id;
  elements.noSelectionState.classList.add('hidden');
  elements.activeChatView.classList.remove('hidden');

  renderConversationsList();
  fetchMessages(id, true);
};

function updateActiveChatHeader() {
  if (!state.activeConversation) return;

  const c = state.activeConversation;
  const isHumanMode = c.mode === 'human';

  elements.activeUserName.textContent = c.user_name || 'Customer';
  elements.activeAvatar.textContent = (c.user_name || 'U').charAt(0).toUpperCase();
  elements.activePlatformBadge.textContent = c.platform === 'messenger' ? 'Messenger / Page' : 'Telegram';
  elements.activePlatformBadge.className = `platform-badge ${c.platform}`;
  elements.activeUserId.textContent = `Platform User ID: ${c.external_user_id}`;

  elements.activeModeIndicator.textContent = isHumanMode ? '👤 Human Takeover Active' : '🤖 AI Bot Responding';
  elements.activeModeIndicator.className = `mode-indicator ${c.mode}`;

  elements.toggleModeBtn.textContent = isHumanMode ? '🤖 Switch to Bot Mode' : '👤 Take Over Conversation';

  if (isHumanMode) {
    elements.composerBannerText.textContent = '👤 Human mode is active. You can now reply directly to the customer.';
    elements.composerBanner.style.borderColor = '#eab308';
  } else {
    elements.composerBannerText.textContent = '🤖 Bot mode is active. Automated replies will trigger unless you take over or the customer asks for a human.';
    elements.composerBanner.style.borderColor = '#2563eb';
  }
}

function renderMessages(autoScroll = true) {
  if (state.messages.length === 0) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-state">
        <p>No message history for this conversation.</p>
      </div>
    `;
    return;
  }

  elements.messagesContainer.innerHTML = state.messages
    .map((msg) => {
      let senderBadge = '';
      if (msg.sender === 'user') {
        senderBadge = '👤 Customer';
      } else if (msg.sender === 'bot') {
        senderBadge = '🤖 AI Assistant';
      } else if (msg.sender === 'agent') {
        senderBadge = '👨‍💼 Support Team';
      }

      const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="message-bubble-row ${msg.sender}">
          <div class="message-sender-meta">
            <span>${senderBadge}</span>
          </div>
          <div class="message-bubble">${escapeHtml(msg.text)}</div>
          <div class="message-time">${timeStr}</div>
        </div>
      `;
    })
    .join('');

  if (autoScroll) {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }
}

// ==========================================
// Helpers
// ==========================================

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSec = Math.floor((now - date) / 1000);

  if (diffInSec < 60) return 'just now';
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h`;
  return `${Math.floor(diffInHours / 24)}d`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
