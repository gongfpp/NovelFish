/* ============================================================
   store.js — 全局状态、持久化、事件总线、通用工具
   ============================================================ */
window.NovelFish = window.NovelFish || {};

(function (NF) {
  'use strict';

  var STORAGE_KEY = 'novelfish.state.v1';
  var SAVE_DEBOUNCE = 400;
  var MAX_TEXT_BYTES = 1.6 * 1024 * 1024; // 本地存储里的正文上限，超出则不落盘

  /* ---------------- 工具 ---------------- */
  var util = {
    clamp: function (v, min, max) { return Math.min(max, Math.max(min, v)); },

    escapeHtml: function (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    debounce: function (fn, wait) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, wait);
      };
    },

    throttle: function (fn, wait) {
      var last = 0, timer = null, lastArgs = null;
      return function () {
        var now = Date.now(), self = this;
        lastArgs = arguments;
        if (now - last >= wait) { last = now; fn.apply(self, lastArgs); }
        else if (!timer) {
          timer = setTimeout(function () {
            timer = null; last = Date.now(); fn.apply(self, lastArgs);
          }, wait - (now - last));
        }
      };
    },

    fmt: function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },

    /** 简易 Markdown：代码块 / 行内代码 / 粗体 / 无序列表 / 换行 */
    richText: function (src) {
      var text = String(src || '');
      var blocks = [];
      // 先抽出围栏代码块，避免内部被二次处理
      text = text.replace(/```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
        var i = blocks.length;
        blocks.push(
          '<pre class="rt-pre"><code data-lang="' + util.escapeHtml(lang || '') + '">' +
          util.escapeHtml(code.replace(/\n$/, '')) +
          '</code></pre>'
        );
        return '\u0000BLOCK' + i + '\u0000';
      });

      text = util.escapeHtml(text);
      text = text.replace(/`([^`\n]+)`/g, '<code class="rt-code">$1</code>');
      text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

      var lines = text.split('\n');
      var out = [];
      var listBuf = [];
      var tableBuf = [];
      var flushList = function () {
        if (!listBuf.length) return;
        out.push('<ul class="rt-ul">' + listBuf.join('') + '</ul>');
        listBuf = [];
      };
      var flushTable = function () {
        if (!tableBuf.length) return;
        // 丢掉 |---|---| 这类分隔行
        var rows = tableBuf.filter(function (r) { return !/^\|[\s:|-]+\|$/.test(r); });
        if (rows.length) {
          var html = '<table class="rt-table">';
          rows.forEach(function (r, i) {
            var cells = r.replace(/^\||\|$/g, '').split('|');
            var tag = i === 0 ? 'th' : 'td';
            html += '<tr>' + cells.map(function (c) {
              return '<' + tag + '>' + c.trim() + '</' + tag + '>';
            }).join('') + '</tr>';
          });
          out.push(html + '</table>');
        }
        tableBuf = [];
      };

      lines.forEach(function (line) {
        var t = line.trim();
        if (/^\u0000BLOCK\d+\u0000$/.test(t)) {
          flushList(); flushTable();
          out.push(t.replace(/\u0000BLOCK(\d+)\u0000/g, function (_, i) { return blocks[+i]; }));
          return;
        }
        if (!t) { flushList(); flushTable(); return; }
        if (/^\|.*\|$/.test(t)) { flushList(); tableBuf.push(t); return; }
        flushTable();
        if (/^[-*]\s+/.test(t)) { listBuf.push('<li>' + t.replace(/^[-*]\s+/, '') + '</li>'); return; }
        if (/^\d+[.、]\s*/.test(t) && /\d+[.、]/.test(t.slice(0, 5))) {
          listBuf.push('<li>' + t + '</li>'); return;
        }
        flushList();
        out.push('<p>' + t + '</p>');
      });
      flushList();
      flushTable();

      return out.join('')
        .replace(/\u0000BLOCK(\d+)\u0000/g, function (_, i) { return blocks[+i]; });
    }
  };

  /* ---------------- 默认状态 ---------------- */
  function defaultState() {
    return {
      version: 2,
      skin: 'deepseek',
      reading: { font: 14, line: 1.9, width: 780, auto: false, speed: 1 },
      mask: {
        script: 'auto',        // 伪装剧本 id，'auto' 为混合轮换
        blurCollapse: true,    // 窗口失焦自动收起
        openThinking: true,    // 新消息默认展开「深度思考」
        chrome: true,          // 显示浏览器外框
        os: 'mac',             // 外框系统风格：mac | win
        browser: 'chrome',     // 外框浏览器：chrome | edge
        webSearch: false,      // 输入框里的「智能搜索」开关（纯观感）
        readOnly: false        // 净读模式：折叠对话双方正文
      },
      /* 浏览器外框里显示的资料（地址栏右侧头像与资料面板） */
      browser: { name: '摸鱼的人', email: 'moyu.ren@example.com' },
      novel: { title: '', docId: '', text: '' },
      progress: { chapter: 0, loadedThrough: 0, scrollTop: 0, feedOffset: null },
      /* 会话列表：见 js/core/chat.js */
      chat: { activeId: '', seq: 0, convs: [] },
      sidebar: { open: true, query: '' }
    };
  }

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], v);
      } else if (v !== undefined) {
        base[k] = v;
      }
    });
    return base;
  }

  /* ---------------- 事件总线 ---------------- */
  var listeners = {};

  var bus = {
    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return function off() {
        listeners[evt] = listeners[evt].filter(function (f) { return f !== fn; });
      };
    },
    emit: function (evt, payload) {
      (listeners[evt] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error('[NovelFish] listener error on "' + evt + '"', e); }
      });
    },
    clear: function () { listeners = {}; }
  };

  /* ---------------- Toast ---------------- */
  function toast(msg, ms) {
    var wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 2000);
  }

  /* ---------------- 存储 ---------------- */
  var state = defaultState();

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 隐私模式 */ }
    if (!raw) return state;
    try {
      var parsed = JSON.parse(raw);
      state = deepMerge(defaultState(), parsed);
    } catch (e) {
      console.warn('[NovelFish] 本地状态解析失败，已重置', e);
      state = defaultState();
    }
    return state;
  }

  function snapshot() {
    var s = JSON.parse(JSON.stringify(state));
    if (s.novel.text && s.novel.text.length > MAX_TEXT_BYTES) {
      s.novel.text = ''; // 超长正文不落盘，避免撑爆 localStorage
      s.novel.tooBig = true;
    }
    return s;
  }

  var doSave = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch (e) {
      console.warn('[NovelFish] 状态写入失败（可能超出配额）', e);
    }
  };
  var save = util.debounce(doSave, SAVE_DEBOUNCE);

  function reset() {
    state = defaultState();
    doSave();
  }

  NF.store = {
    get state() { return state; },
    load: load,
    save: save,
    saveNow: doSave,
    reset: reset,
    patch: function (patch) {
      deepMerge(state, patch);
      save();
      bus.emit('state', state);
      if (patch.reading) bus.emit('reading', state.reading);
      if (patch.mask) bus.emit('mask', state.mask);
      return state;
    }
  };

  NF.bus = bus;
  NF.util = util;
  NF.toast = toast;
  NF.STORAGE_KEY = STORAGE_KEY;
})(window.NovelFish);
