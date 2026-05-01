/**
 * Tiny Chat - SillyTavern 扩展入口
 *
 * 像 Kingfall 一样，把入口挂到酒馆输入框左侧的扩展菜单中，
 * 点击后以 iframe 浮层方式打开 Tiny_Chat.html。
 */

const MODULE_NAME = 'Tiny Chat';
const MENU_ITEM_ID = 'tiny-chat-menu-item';
const MENU_API_ID = 'tiny-chat.open';
const MENU_LABEL = 'Tiny Chat';
const MENU_ICON = 'fa-solid fa-feather-pointed';
const PAGE_RELATIVE = './Tiny_Chat.html';
const OVERLAY_ID = 'tiny-chat-overlay';
const OVERLAY_FRAME_ID = 'tiny-chat-overlay-frame';
const OVERLAY_STYLE_ID = 'tiny-chat-overlay-style';
const OVERLAY_EXPANDED_CLASS = 'tiny-chat-overlay--expanded';

let initialized = false;
let overlayRoot = null;
let overlayFrame = null;
let overlayScale = 1;
let overlayDragState = null;

const OVERLAY_BASE_WIDTH = 380;
const OVERLAY_BASE_HEIGHT = 600;
const OVERLAY_MOBILE_WIDTH = 320;
const OVERLAY_MOBILE_HEIGHT = 505;
const OVERLAY_MARGIN = 16;
const OVERLAY_MIN_SCALE = 0.65;
const OVERLAY_MAX_SCALE = 1.55;
const OVERLAY_STATE_STORAGE_KEY = 'tiny-chat.overlayState';

function showToast(level, message) {
  const toast = window.toastr && window.toastr[level];
  if (typeof toast === 'function') {
    toast(message);
    return;
  }
  const method = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
  console[method](`[${MODULE_NAME}] ${message}`);
}

function resolvePageUrl() {
  return new URL(PAGE_RELATIVE, import.meta.url).href;
}

function ensureOverlayStyles() {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      left: 16px;
      top: calc(100vh - 616px);
      width: 380px;
      height: 600px;
      z-index: 2147483000;
      display: flex;
      align-items: stretch;
      justify-content: center;
      pointer-events: auto;
      background: transparent;
      overflow: visible;
      transform-origin: 0 0;
      transform: scale(var(--tiny-chat-scale, 1));
      touch-action: none;
    }

    #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} {
      inset: 0;
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
      padding: 0 16px;
      overflow: hidden;
    }

    @supports (height: 100dvh) {
      #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} {
        height: 100dvh;
        min-height: 100dvh;
      }
    }

    #${OVERLAY_ID}.${OVERLAY_ID}--hidden {
      display: none;
    }

    #${OVERLAY_ID} .tiny-chat-overlay__frame {
      display: block;
      flex: 1 1 auto;
      align-self: stretch;
      width: 100%;
      height: 100%;
      min-height: 100%;
      max-height: 100%;
      border: 0;
      background: transparent;
      pointer-events: auto;
      border-radius: 0;
      overflow: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;
      box-shadow: none;
      outline: none;
    }

    #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} .tiny-chat-overlay__frame {
      width: min(960px, calc(100vw - 32px));
      height: 100vh;
      min-height: 100vh;
      max-height: 100vh;
    }

    @supports (height: 100dvh) {
      #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} .tiny-chat-overlay__frame {
        height: 100dvh;
        min-height: 100dvh;
        max-height: 100dvh;
      }
    }

    #${OVERLAY_ID} .tiny-chat-overlay__frame::-webkit-scrollbar {
      width: 0;
      height: 0;
    }

    @media (max-width: 768px) {
      #${OVERLAY_ID} {
        left: 8px;
        right: auto;
        top: calc(100vh - 513px);
        width: 320px;
        height: 505px;
      }

      #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} {
        padding: 0;
      }

      #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} .tiny-chat-overlay__frame {
        width: 100vw;
        height: 100vh;
        min-height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }

      @supports (height: 100dvh) {
        #${OVERLAY_ID}.${OVERLAY_EXPANDED_CLASS} .tiny-chat-overlay__frame {
          height: 100dvh;
          min-height: 100dvh;
          max-height: 100dvh;
        }
      }
    }
  `;
  document.head.appendChild(style);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCompactBaseSize() {
  const isMobile = window.matchMedia?.('(max-width: 768px)')?.matches;
  return {
    width: isMobile ? OVERLAY_MOBILE_WIDTH : OVERLAY_BASE_WIDTH,
    height: isMobile ? OVERLAY_MOBILE_HEIGHT : OVERLAY_BASE_HEIGHT,
    margin: isMobile ? 8 : OVERLAY_MARGIN,
  };
}

function clampOverlayPosition() {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.classList.contains(OVERLAY_EXPANDED_CLASS)) return null;

  const rect = overlayRoot.getBoundingClientRect();
  const width = rect.width || overlayRoot.offsetWidth * overlayScale;
  const height = rect.height || overlayRoot.offsetHeight * overlayScale;
  const maxLeft = Math.max(0, window.innerWidth - width);
  const maxTop = Math.max(0, window.innerHeight - height);
  const nextLeft = clamp(parseFloat(overlayRoot.style.left || rect.left || 0), 0, maxLeft);
  const nextTop = clamp(parseFloat(overlayRoot.style.top || rect.top || 0), 0, maxTop);

  overlayRoot.style.left = `${nextLeft}px`;
  overlayRoot.style.top = `${nextTop}px`;
  return { left: nextLeft, top: nextTop };
}

function setOverlayScale(nextScale, anchorClientX = null, anchorClientY = null) {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.classList.contains(OVERLAY_EXPANDED_CLASS)) return;

  const oldScale = overlayScale || 1;
  const scale = clamp(nextScale, OVERLAY_MIN_SCALE, OVERLAY_MAX_SCALE);
  if (Math.abs(scale - oldScale) < 0.001) return;

  const rect = overlayRoot.getBoundingClientRect();
  const anchorX = typeof anchorClientX === 'number' ? anchorClientX : rect.left + rect.width / 2;
  const anchorY = typeof anchorClientY === 'number' ? anchorClientY : rect.top + rect.height / 2;
  const originLeft = parseFloat(overlayRoot.style.left || rect.left || 0);
  const originTop = parseFloat(overlayRoot.style.top || rect.top || 0);
  const localX = (anchorX - originLeft) / oldScale;
  const localY = (anchorY - originTop) / oldScale;

  overlayScale = scale;
  overlayRoot.style.setProperty('--tiny-chat-scale', String(scale));
  overlayRoot.style.left = `${anchorX - localX * scale}px`;
  overlayRoot.style.top = `${anchorY - localY * scale}px`;
  clampOverlayPosition();
  persistOverlayState();
}

function readStoredOverlayState() {
  try {
    const raw = window.localStorage?.getItem(OVERLAY_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function persistOverlayState() {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.classList.contains(OVERLAY_EXPANDED_CLASS)) return;
  try {
    const payload = {
      left: parseFloat(overlayRoot.style.left || '0') || 0,
      top: parseFloat(overlayRoot.style.top || '0') || 0,
      width: parseFloat(overlayRoot.style.width || '0') || getCompactBaseSize().width,
      height: parseFloat(overlayRoot.style.height || '0') || getCompactBaseSize().height,
      scale: overlayScale,
    };
    window.localStorage?.setItem(OVERLAY_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {}
}

function resetOverlayPositionIfNeeded() {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.style.left || overlayRoot.style.top) return;
  const storedState = readStoredOverlayState();
  const { width, height, margin } = getCompactBaseSize();
  overlayScale = clamp(Number(storedState?.scale) || 1, OVERLAY_MIN_SCALE, OVERLAY_MAX_SCALE);
  overlayRoot.style.width = `${Number(storedState?.width) || width}px`;
  overlayRoot.style.height = `${Number(storedState?.height) || height}px`;
  overlayRoot.style.left = `${Number.isFinite(Number(storedState?.left)) ? Number(storedState.left) : margin}px`;
  overlayRoot.style.top = `${Number.isFinite(Number(storedState?.top)) ? Number(storedState.top) : Math.max(margin, window.innerHeight - height - margin)}px`;
  overlayRoot.style.setProperty('--tiny-chat-scale', String(overlayScale));
  clampOverlayPosition();
}

function startOverlayDrag(event) {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.classList.contains(OVERLAY_EXPANDED_CLASS)) return;
  if (event.button !== 2) return;

  event.preventDefault();
  event.stopPropagation();
  const rect = overlayRoot.getBoundingClientRect();
  overlayDragState = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
    left: parseFloat(overlayRoot.style.left || rect.left || 0),
    top: parseFloat(overlayRoot.style.top || rect.top || 0),
  };
  try { overlayRoot.setPointerCapture?.(event.pointerId); } catch (error) {}
}

function moveOverlayDrag(event) {
  if (!overlayDragState || !overlayRoot) return;
  event.preventDefault();
  const dx = event.clientX - overlayDragState.lastX;
  const dy = event.clientY - overlayDragState.lastY;
  overlayRoot.style.left = `${overlayDragState.left + dx}px`;
  overlayRoot.style.top = `${overlayDragState.top + dy}px`;
  const clamped = clampOverlayPosition();
  overlayDragState.left = clamped?.left ?? parseFloat(overlayRoot.style.left || 0);
  overlayDragState.top = clamped?.top ?? parseFloat(overlayRoot.style.top || 0);
  overlayDragState.lastX = event.clientX;
  overlayDragState.lastY = event.clientY;
  persistOverlayState();
}

function endOverlayDrag(event) {
  if (!overlayDragState) return;
  try { overlayRoot?.releasePointerCapture?.(overlayDragState.pointerId); } catch (error) {}
  overlayDragState = null;
  if (event) event.preventDefault();
}

function handleOverlayWheel(event) {
  syncOverlayRefs();
  if (!overlayRoot || overlayRoot.classList.contains(OVERLAY_EXPANDED_CLASS)) return;
  if (!event.ctrlKey) return;

  event.preventDefault();
  event.stopPropagation();
  const delta = -event.deltaY;
  const factor = Math.exp(delta * 0.0012);
  setOverlayScale(overlayScale * factor, event.clientX, event.clientY);
}

function bindOverlayInteractions(root) {
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  root.addEventListener('pointerdown', startOverlayDrag);
  root.addEventListener('pointermove', moveOverlayDrag);
  root.addEventListener('pointerup', endOverlayDrag);
  root.addEventListener('pointercancel', endOverlayDrag);
  root.addEventListener('wheel', handleOverlayWheel, { passive: false });
}


function syncOverlayRefs() {
  overlayRoot = document.getElementById(OVERLAY_ID) || null;
  overlayFrame = document.getElementById(OVERLAY_FRAME_ID) || null;
}

function focusExistingOverlay() {
  syncOverlayRefs();
  if (!overlayRoot || !overlayFrame) {
    return null;
  }

  overlayRoot.classList.remove(`${OVERLAY_ID}--hidden`);
  try {
    overlayFrame.focus();
    overlayFrame.contentWindow?.focus?.();
  } catch (error) {}
  return overlayRoot;
}

function createOverlay() {
  ensureOverlayStyles();
  const existing = focusExistingOverlay();
  if (existing) {
    return existing;
  }

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  resetOverlayPositionIfNeeded();
  bindOverlayInteractions(root);
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      closeOverlay();
    }
  });

  const frame = document.createElement('iframe');
  frame.id = OVERLAY_FRAME_ID;
  frame.className = 'tiny-chat-overlay__frame';
  frame.src = resolvePageUrl();
  frame.title = MENU_LABEL;
  frame.setAttribute('allowtransparency', 'true');

  root.appendChild(frame);
  document.body.appendChild(root);

  overlayRoot = root;
  overlayFrame = frame;
  resetOverlayPositionIfNeeded();
  root.style.setProperty('--tiny-chat-scale', String(overlayScale));
  return root;
}

function closeOverlay() {
  syncOverlayRefs();
  if (!overlayRoot) {
    return;
  }
  persistOverlayState();
  try {
    overlayRoot.remove();
  } catch (error) {
    console.warn(`[${MODULE_NAME}] 关闭浮层失败。`, error);
  }
  overlayRoot = null;
  overlayFrame = null;
}

function hasOverlay() {
  syncOverlayRefs();
  return Boolean(overlayRoot && document.body.contains(overlayRoot));
}

function openTinyChat() {
  const overlay = createOverlay();
  if (!overlay) {
    showToast('warning', 'Tiny Chat 打开失败。');
    return null;
  }

  try {
    overlayFrame?.focus?.();
    overlayFrame?.contentWindow?.focus?.();
  } catch (error) {}

  return overlay;
}

function toggleTinyChat() {
  if (hasOverlay()) {
    closeOverlay();
    return null;
  }
  return openTinyChat();
}

function setOverlayExpanded(expanded) {
  syncOverlayRefs();
  if (!overlayRoot) return;

  if (expanded) {
    overlayRoot.dataset.compactLeft = overlayRoot.style.left || '';
    overlayRoot.dataset.compactTop = overlayRoot.style.top || '';
    overlayRoot.dataset.compactWidth = overlayRoot.style.width || '';
    overlayRoot.dataset.compactHeight = overlayRoot.style.height || '';
    overlayDragState = null;

    overlayRoot.classList.add(OVERLAY_EXPANDED_CLASS);
    overlayRoot.style.left = '0px';
    overlayRoot.style.top = '0px';
    overlayRoot.style.width = '100vw';
    overlayRoot.style.height = window.CSS?.supports?.('height', '100dvh') ? '100dvh' : '100vh';
    overlayRoot.style.setProperty('--tiny-chat-scale', '1');
    return;
  }

  overlayRoot.classList.remove(OVERLAY_EXPANDED_CLASS);
  overlayRoot.style.left = overlayRoot.dataset.compactLeft || overlayRoot.style.left;
  overlayRoot.style.top = overlayRoot.dataset.compactTop || overlayRoot.style.top;
  overlayRoot.style.width = overlayRoot.dataset.compactWidth || `${getCompactBaseSize().width}px`;
  overlayRoot.style.height = overlayRoot.dataset.compactHeight || `${getCompactBaseSize().height}px`;
  overlayRoot.style.setProperty('--tiny-chat-scale', String(overlayScale));
  clampOverlayPosition();
  persistOverlayState();
}

function translateFramePoint(clientX, clientY) {
  syncOverlayRefs();
  if (!overlayFrame) {
    return { x: clientX, y: clientY };
  }
  const rect = overlayFrame.getBoundingClientRect();
  const frameWidth = overlayFrame.offsetWidth || rect.width || 1;
  const frameHeight = overlayFrame.offsetHeight || rect.height || 1;
  const scaleX = rect.width / frameWidth;
  const scaleY = rect.height / frameHeight;
  return {
    x: rect.left + clientX * scaleX,
    y: rect.top + clientY * scaleY,
  };
}

function handleOverlayMessage(event) {
  const data = event && event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'tinychat.closeOverlay') {
    closeOverlay();
    return;
  }

  if (data.type === 'tinychat.modalState') {
    setOverlayExpanded(data.open === true);
    return;
  }

  if (data.type === 'tinychat.hostWheel') {
    if (!data.ctrlKey) return;
    const point = translateFramePoint(Number(data.clientX) || 0, Number(data.clientY) || 0);
    const factor = Math.exp((-Number(data.deltaY || 0)) * 0.0012);
    setOverlayScale(overlayScale * factor, point.x, point.y);
    return;
  }

  if (data.type === 'tinychat.hostRightDragStart') {
    const point = translateFramePoint(Number(data.clientX) || 0, Number(data.clientY) || 0);
    startOverlayDrag({ button: 2, pointerId: data.pointerId || 0, clientX: point.x, clientY: point.y, preventDefault() {}, stopPropagation() {} });
    return;
  }

  if (data.type === 'tinychat.hostRightDragMove') {
    const point = translateFramePoint(Number(data.clientX) || 0, Number(data.clientY) || 0);
    moveOverlayDrag({ clientX: point.x, clientY: point.y, preventDefault() {} });
    return;
  }

  if (data.type === 'tinychat.hostRightDragEnd') {
    endOverlayDrag({ preventDefault() {} });
  }
}

function activateFromMenu(event) {
  if (event && event.type === 'keydown') {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
  }
  toggleTinyChat();
}

function createManualMenuItem() {
  if (document.getElementById(MENU_ITEM_ID)) {
    return true;
  }

  const menu = document.getElementById('extensionsMenu');
  if (!menu) {
    return false;
  }

  const item = document.createElement('div');
  item.id = MENU_ITEM_ID;
  item.className = 'list-group-item flex-container flexGap5 interactable';
  item.tabIndex = 0;
  item.innerHTML = `
    <div class="${MENU_ICON} extensionsMenuExtensionButton"></div>
    <span>${MENU_LABEL}</span>
  `;
  item.addEventListener('click', activateFromMenu);
  item.addEventListener('keydown', activateFromMenu);
  menu.appendChild(item);
  return true;
}

function ensureManualMenuItem(retries = 20) {
  if (createManualMenuItem()) {
    return;
  }

  if (retries <= 0) {
    console.warn(`[${MODULE_NAME}] 未找到 #extensionsMenu，无法插入菜单项。`);
    return;
  }

  window.setTimeout(() => ensureManualMenuItem(retries - 1), 500);
}

async function registerMenuItem() {
  if (window.ST_API?.ui?.registerExtensionsMenuItem) {
    try {
      await window.ST_API.ui.registerExtensionsMenuItem({
        id: MENU_API_ID,
        label: MENU_LABEL,
        icon: MENU_ICON,
        onClick: toggleTinyChat,
      });
      return;
    } catch (error) {
      console.warn(`[${MODULE_NAME}] ST_API 菜单注册失败，改用手动注入。`, error);
    }
  }

  ensureManualMenuItem();
}

function getContext() {
  return window.SillyTavern?.getContext?.() || null;
}

function init() {
  if (initialized) {
    return;
  }
  initialized = true;
  window.addEventListener('message', handleOverlayMessage);
  registerMenuItem();
  console.log(`[${MODULE_NAME}] 已初始化。`);
}

function bootstrap() {
  const context = getContext();
  if (!context || !context.eventSource || !context.event_types) {
    window.setTimeout(bootstrap, 500);
    return;
  }

  const { eventSource, event_types } = context;
  if (typeof eventSource.on === 'function' && event_types.APP_READY) {
    eventSource.on(event_types.APP_READY, init);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.setTimeout(init, 0);
  } else {
    window.addEventListener('load', init, { once: true });
  }
}

bootstrap();
