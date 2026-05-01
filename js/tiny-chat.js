/**
 * Tiny Chat - 对话核心模块
 */
export class TinyChat {
  constructor(rootEl, options = {}) {
    this.root = typeof rootEl === 'string' ? document.querySelector(rootEl) : rootEl;
    this.opponentName = options.opponentName || '赫敏·格兰杰';
    this.playerName = options.playerName || '你';
    this.onPlayerSend = options.onPlayerSend || null;

    this.messagesEl = null;
    this.speechInput = null;
    this.sendBtn = null;
    this.modalMask = null;
    this.modalCloseBtn = null;
    this.chatTitle = null;

    this._init();
  }

  _init() {
    this.root.innerHTML = `
      <div class="chat-panel">
        <div class="paper-panel">
          <div class="chat-title">Owl Post</div>
          <div class="messages"></div>
          <div class="controls">
            <div class="pencil-row">
              <div class="pencil-input-slot">
                <div class="pencil-input" contenteditable="true" spellcheck="false" data-placeholder="提起羽毛笔…"></div>
              </div>
              <button class="stamp-btn" type="button" aria-label="发送"></button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-mask">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Floo Network">
          <div class="modal-head">
            <div class="modal-title">Floo Network</div>
            <button class="modal-close" type="button" aria-label="关闭">关闭</button>
          </div>
          <button class="modal-page-arrow modal-page-arrow--prev" type="button" aria-label="上一页" disabled></button>
          <button class="modal-page-arrow modal-page-arrow--next" type="button" aria-label="下一页" disabled></button>
          <div class="network-panels">
            <section class="network-panel network-panel--left">
              <div class="api-panel">
                <div class="api-grid">
                  <div class="field url">
                    <label class="api-label">Floo Channel</label>
                    <input class="api-input" placeholder="https://api.openai.com/v1" />
                  </div>
                  <div class="field key">
                    <label class="api-label">Floo Powder</label>
                    <input class="api-input" type="password" placeholder="sk-..." />
                  </div>
                  <div class="field model">
                    <label class="api-label">Destination</label>
                    <input class="api-input" placeholder="gpt-4o-mini" />
                  </div>
                </div>
              </div>
            </section>
            <section class="network-panel network-panel--right"></section>
          </div>
        </div>
      </div>
    `;

    this.messagesEl = this.root.querySelector('.messages');
    this.speechInput = this.root.querySelector('.pencil-input');
    this.sendBtn = this.root.querySelector('.stamp-btn');
    this.modalMask = this.root.querySelector('.modal-mask');
    this.modalCloseBtn = this.root.querySelector('.modal-close');
    this.chatTitle = this.root.querySelector('.chat-title');

    this.sendBtn.addEventListener('click', () => this._onSend());
    this.speechInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._onSend(); }
    });
    this.speechInput.addEventListener('input', () => this._keepInputAtBottom());

    // Owl Post title opens modal
    this.chatTitle.style.cursor = 'pointer';
    this.chatTitle.addEventListener('click', () => this.openModal());

    // Close modal
    this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.modalMask.addEventListener('click', (e) => {
      if (e.target === this.modalMask) this.closeModal();
    });

    // API label click toggles emerald state
    this.root.querySelectorAll('.api-label').forEach(label => {
      label.addEventListener('click', () => {
        const isEmerald = label.classList.contains('is-emerald');
        label.classList.remove('is-emerald', 'is-flame');
        if (!isEmerald) label.classList.add('is-emerald');
      });
    });
  }

  // --- Public API ---

  openModal() {
    this.modalMask.classList.add('open');
  }

  closeModal() {
    this.modalMask.classList.remove('open');
  }

  addMessage(type, who, text) {
    const row = document.createElement('div');
    row.className = `msg-row ${type}-row`;
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerHTML = `<span class="who">${this._escapeHtml(who)}</span>${this._escapeHtml(text).replaceAll('\n', '<br>')}`;
    row.appendChild(div);
    this.messagesEl.appendChild(row);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  addPencilLine(side = 'right', tight = false) {
    const row = document.createElement('div');
    row.className = `msg-row system-row ${side === 'left' ? 'left' : 'right'}${tight ? ' tight' : ''}`;
    const div = document.createElement('div');
    div.className = `msg system pencil-sep ${side === 'left' ? 'pencil-sep-left' : 'pencil-sep-right'}`;
    row.appendChild(div);
    this.messagesEl.appendChild(row);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  clearMessages() {
    this.messagesEl.innerHTML = '';
  }

  // --- Private ---

  async _onSend() {
    const text = this._getSpeechText();
    if (!text) return;

    this.addMessage('player', this.playerName, text);
    this.addPencilLine('right', true);
    this.speechInput.textContent = '';

    this._setSending(true);

    try {
      if (this.onPlayerSend) {
        const replies = await this.onPlayerSend(text);
        const lines = Array.isArray(replies) ? replies : (replies ? [replies] : []);
        lines.forEach(line => this.addMessage('ai', this.opponentName, line));
      }
    } finally {
      this._setSending(false);
    }

    this.addPencilLine('left', false);
    this.speechInput.focus();
  }

  _getSpeechText() {
    return (this.speechInput.innerText || '').replace(/\u00A0/g, ' ').replace(/[\r\n]+/g, ' ').trim();
  }

  _setSending(isSending) {
    this.sendBtn.classList.toggle('sending', !!isSending);
    this.sendBtn.disabled = !!isSending;
  }

  _keepInputAtBottom() {
    this.speechInput.scrollTop = this.speechInput.scrollHeight;
  }

  _escapeHtml(s) {
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
  }
}
