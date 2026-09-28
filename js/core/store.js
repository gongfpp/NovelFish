/* ============================================================
   store.js — 全局状态、持久化、事件总线、通用工具
   ============================================================ */
window.NovelFish = window.NovelFish || {};

(function (NF) {
  'use strict';

  var STORAGE_KEY = 'novelfish.state.v1';
  var SAVE_DEBOUNCE = 400;
  var MAX_TEXT_BYTES = 1.6 * 1024 * 1024; // 本地存储里的正文上限，超出则不落盘

  /**
   * 默认资料。伪装的关键是「看起来像个普通账号」——
   * 名字取一个平平无奇的中文名，头像就用它的姓氏，不要带任何和本应用沾边的字。
   * 用户可在 设置 → 外观 里随时改。
   */
  var DEFAULT_PROFILE_NAME = '陈默';
  var DEFAULT_PROFILE_EMAIL = 'chenmo@example.com';
  var LEGACY_PROFILE_NAME = '摸鱼的人';
  var LEGACY_PROFILE_EMAIL = 'moyu.ren@example.com';

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
      version: 5,
      skin: 'deepseek',
      /* 正文默认排版对齐 DeepSeek 官网「深度思考」的规格：14px / 行距 1.7（=24px）/ 栏宽 840px */
      reading: { font: 14, line: 1.7, width: 840, auto: false, speed: 1 },
      mask: {
        script: 'auto',        // 伪装剧本 id，'auto' 为混合轮换
        blurCollapse: true,    // 窗口失焦自动收起
        openThinking: true,    // 新消息默认展开「深度思考」
        chrome: true,          // 显示浏览器外框
        os: 'mac',             // 外框系统风格：mac | win
        browser: 'chrome',     // 外框浏览器：chrome | edge
        webSearch: false       // 输入框里的「智能搜索」开关
      },
      /* 浏览器外框里显示的资料：地址栏头像、资料面板、标签页标题 */
      browser: {
        name: DEFAULT_PROFILE_NAME,
        email: DEFAULT_PROFILE_EMAIL,
        avatar: '',                     // 自定义头像（dataURL），空则用首字母
        avatarColor: '#4d6bfe',         // 头像底色
        tabTitle: ''                    // 空则跟随皮肤自带的标题
      },
      /* text 给纯文本用；chapters 给 EPUB 用（章节名来自书的目录，重开时不必再解析） */
      novel: { title: '', docId: '', text: '', chapters: null },
      progress: { chapter: 0, loadedThrough: 0, scrollTop: 0, feedOffset: null },
      /* 会话列表：见 js/core/chat.js */
      chat: { activeId: '', seq: 0, convs: [] },
      sidebar: { open: true, query: '' },
      /* 浏览器行为：缩放倍率、书签（地址栏星标点出来的） */
      ui: { zoom: 1 },
      bookmarks: [],
      /* 一次性提示的去重标记：同 key 只提示一次，避免每次打开都冒小说相关的提示 */
      seen: {}
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
  /**
   * 弹一条提示。返回元素，需要提前收起时交给 NF.toast.hide()。
   * 解析 EPUB 这类有等待感的长操作会用到。
   */
  function toast(msg, ms) {
    var wrap = document.getElementById('toastWrap');
    if (!wrap) return null;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    var gone = false;
    function hide() {
      if (gone || !el.parentNode) return;
      gone = true;
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 260);
    }
    el.hide = hide;
    wrap.appendChild(el);
    setTimeout(hide, ms || 2000);
    return el;
  }

  toast.hide = function (el) { if (el && el.hide) el.hide(); };

  /* ---------------- 存储 ---------------- */
  var state = defaultState();

  /**
   * 老存档的顺带修正。只在用户还停在上一个版本的默认值时才动，
   * 已经自己调过字号 / 行距 / 宽度 / 资料的一律保留。
   */
  function migrate(parsed) {
    var from = parsed.version || 0;

    if (from < 4 && state.reading.line === 1.9 && state.reading.width === 780) {
      state.reading.line = 1.7;
      state.reading.width = 840;
    }

    // 旧默认资料「摸鱼的人」会暴露这台机器上在干什么，只有原样没改过才替换
    if (from < 5 && state.browser.name === LEGACY_PROFILE_NAME) {
      state.browser.name = DEFAULT_PROFILE_NAME;
      if (state.browser.email === LEGACY_PROFILE_EMAIL) state.browser.email = DEFAULT_PROFILE_EMAIL;
      state.browser.avatar = '';
    }

    state.version = defaultState().version;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 隐私模式 */ }
    if (!raw) return state;
    try {
      var parsed = JSON.parse(raw);
      state = deepMerge(defaultState(), parsed);
      migrate(parsed);
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
    // novel.chapters（EPUB）的体积在装载时就已经卡过上限 —— 见 app.js setNovelChapters。
    // 这里不再重复测量：正文有几十万字，每次滚动落盘都 JSON.stringify 一遍会白白拖慢。
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
