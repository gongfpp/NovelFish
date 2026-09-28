/* ============================================================
   skins/deepseek.js — 伪装成浏览器打开 chat.deepseek.com
   · 正文位置：「深度思考」折叠框
   · 伪装位置：提问气泡 + 回答正文
   · 顶部常驻折叠条：随时一键收起「深度思考」，形成老板键手感
   · 净读：一键折叠对话双方正文，只留思考框里的正文
   ============================================================ */
(function (NF) {
  'use strict';

  /* ---------------- 图标 ---------------- */

  var MARK =
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="16" cy="16" r="16" fill="#4D6BFE"/>' +
    '<path d="M6.6 18.6c3 2.9 7.2 3.6 10.9 1.9 2.6-1.2 4.3-3.5 5.1-6.2l.5-1.7c.3-.9 1.6-.9 1.9 0l.6 1.8c.8 2.6.2 5-1.7 6.7-2.5 2.3-6.3 3.2-9.7 2.4-3-.7-5.6-2.4-7.6-4.9z" fill="#fff"/>' +
    '<circle cx="10.4" cy="14.2" r="1.5" fill="#fff"/>' +
    '</svg>';

  var WHALE =
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M5 18.8c3.2 3.1 7.8 3.9 11.8 2.1 2.8-1.3 4.7-3.8 5.5-6.7l.6-1.9c.3-1 1.6-1 1.9 0l.6 2c.9 2.8.2 5.4-1.8 7.2-2.7 2.5-6.8 3.5-10.5 2.6-3.3-.8-6.1-2.6-8.1-5.3z" fill="#fff"/>' +
    '<circle cx="9.6" cy="13.8" r="1.6" fill="#fff"/>' +
    '</svg>';

  var CHEVRON =
    '<svg class="ds-chev" viewBox="0 0 24 24" width="14" height="14">' +
    '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var SPARK =
    '<svg viewBox="0 0 24 24" width="15" height="15">' +
    '<path d="M12 3v2.6M12 18.4V21M4.6 7.6l2.2 1.3M17.2 15.1l2.2 1.3M4.6 16.4l2.2-1.3M17.2 8.9l2.2-1.3" ' +
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  var GLOBE =
    '<svg viewBox="0 0 24 24" width="15" height="15">' +
    '<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M3.8 12h16.4M12 3.8c2.6 2.4 2.6 14 0 16.4M12 3.8c-2.6 2.4-2.6 14 0 16.4" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

  var PANEL =
    '<svg viewBox="0 0 24 24" width="17" height="17">' +
    '<rect x="3" y="4.5" width="18" height="15" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M9.6 4.5v15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  var FOLD =
    '<svg viewBox="0 0 24 24" width="15" height="15">' +
    '<path d="M7.5 4.5L12 9l4.5-4.5M7.5 19.5L12 15l4.5 4.5" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var PAPERCLIP =
    '<svg viewBox="0 0 24 24" width="17" height="17">' +
    '<path d="M16.5 6.5l-7 7a3 3 0 0 0 4.2 4.2l7-7a5 5 0 0 0-7-7l-7.3 7.3a7 7 0 0 0 9.9 9.9l6-6" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  var ARROW_UP =
    '<svg viewBox="0 0 24 24" width="16" height="16">' +
    '<path d="M12 19V6M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var MORE =
    '<svg viewBox="0 0 24 24" width="17" height="17">' +
    '<circle cx="12" cy="5.5" r="1.6" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.6" fill="currentColor"/>' +
    '<circle cx="12" cy="18.5" r="1.6" fill="currentColor"/></svg>';

  function actBtn(title, svg) {
    return '<button class="ds-act" type="button" title="' + title + '">' + svg + '</button>';
  }

  var ACTIONS =
    '<div class="ds-msg-actions">' +
      actBtn('复制', '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>') +
      actBtn('有帮助', '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M7 21V10l4.5-7 .9.5c.9.5 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>') +
      actBtn('没帮助', '<svg viewBox="0 0 24 24" width="15" height="15" style="transform:rotate(180deg)"><path d="M7 21V10l4.5-7 .9.5c.9.5 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>') +
      actBtn('重新生成', '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
    '</div>';

  var CLEANUP = [];

  function historyHtml(api, query) {
    var groups = api.chat.groups(query);
    if (!groups.length) {
      return '<div class="ds-hist-empty">没有匹配的对话</div>';
    }
    return groups.map(function (g) {
      return '<div class="ds-hist-group">' +
        '<div class="ds-hist-label">' + g.label + '</div>' +
        g.items.map(function (it) {
          return '<div class="ds-hist-item' + (it.active ? ' is-active' : '') +
            '" data-conv="' + NF.util.escapeHtml(it.id) + '" title="' + NF.util.escapeHtml(it.title) + '">' +
            NF.util.escapeHtml(it.title) + '</div>';
        }).join('') +
        '</div>';
    }).join('');
  }

  NF.defineSkin({
    id: 'deepseek',
    name: 'DeepSeek',
    brand: { color: '#4D6BFE', letter: 'D' },
    desc: '伪装成浏览器打开 chat.deepseek.com，正文藏进「深度思考」',
    shell: {
      url: 'chat.deepseek.com',
      title: 'DeepSeek - 探索未至之境',
      favicon: MARK
    },

    mount: function (root, api) {
      var esc = NF.util.escapeHtml;
      var state = NF.store.state;

      /* ---------- 骨架 ---------- */
      root.innerHTML =
        '<div class="ds" data-side="' + (api.isSidebarOpen() ? 'open' : 'closed') + '">' +
          '<aside class="ds-side">' +
            '<div class="ds-side-head">' +
              '<div class="ds-logo"><span class="ds-logo-mark">' + MARK + '</span>' +
                '<span class="ds-logo-text">deepseek</span></div>' +
              '<button class="ds-side-icon ds-side-collapse" type="button" title="收起边栏 (Ctrl/&#8984;+B)">' +
                PANEL + '</button>' +
            '</div>' +
            '<div class="ds-side-body">' +
              '<button class="ds-newchat" type="button">' +
                '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
                '新对话</button>' +
              '<label class="ds-search">' +
                '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm8.5 14.5L14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
                '<input type="text" placeholder="搜索" spellcheck="false">' +
                '<button class="ds-search-clear" type="button" title="清空">&#10005;</button>' +
              '</label>' +
              '<nav class="ds-hist"></nav>' +
            '</div>' +
            '<div class="ds-side-foot">' +
              '<button class="ds-user" type="button" title="设置">' +
                '<span class="ds-avatar">摸</span>' +
                '<span class="ds-user-name">摸鱼的人</span>' +
                MORE +
              '</button>' +
            '</div>' +
          '</aside>' +
          '<main class="ds-main">' +
            '<header class="ds-top">' +
              '<button class="ds-icon-btn ds-open-side" type="button" title="展开边栏 (Ctrl/&#8984;+B)">' +
                PANEL + '</button>' +
              '<span class="ds-top-title">新的对话</span>' +
              '<span class="ds-top-actions">' +
                '<button class="ds-ghost-btn" type="button">分享</button>' +
                '<button class="ds-icon-btn ds-open-console" type="button" title="设置">' + MORE + '</button>' +
              '</span>' +
            '</header>' +
            '<div class="ds-stage">' +
              '<div class="ds-welcome">' +
                '<div class="ds-welcome-title">Hi，我是 DeepSeek</div>' +
                '<div class="ds-welcome-sub">我可以帮你写代码、读文件、写作各种创意内容</div>' +
              '</div>' +
              '<div class="ds-thread" data-role="thread" data-readonly="0">' +
                '<div class="ds-thread-inner"></div>' +
              '</div>' +
              '<div class="ds-composer">' +
                '<div class="ds-box">' +
                  '<textarea class="ds-input" rows="1" placeholder="给 DeepSeek 发送消息"></textarea>' +
                  '<div class="ds-box-bar">' +
                    '<span class="ds-tools">' +
                      '<button class="ds-chip' + (api.mask.openThinking ? ' is-on' : '') + '" data-cap="think" type="button">' +
                        SPARK + '深度思考</button>' +
                      '<button class="ds-chip' + (api.mask.webSearch ? ' is-on' : '') + '" data-cap="search" type="button">' +
                        GLOBE + '智能搜索</button>' +
                    '</span>' +
                    '<span class="ds-tools-right">' +
                      '<button class="ds-round" data-act="attach" type="button" title="上传文件">' + PAPERCLIP + '</button>' +
                      '<button class="ds-send" type="button" data-ready="0" title="发送">' + ARROW_UP + '</button>' +
                    '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="ds-disclaimer">内容由 AI 生成，请仔细甄别</div>' +
                '<input type="file" class="ds-file" accept=".txt,.md,text/plain" hidden>' +
              '</div>' +
            '</div>' +
          '</main>' +
        '</div>';

      var dsEl = root.querySelector('.ds');
      var histEl = root.querySelector('.ds-hist');
      var searchLabel = root.querySelector('.ds-search');
      var searchInput = root.querySelector('.ds-search input');
      var stageEl = root.querySelector('.ds-stage');
      var threadEl = root.querySelector('.ds-thread');
      var innerEl = root.querySelector('.ds-thread-inner');
      var titleEl = root.querySelector('.ds-top-title');
      var inputEl = root.querySelector('.ds-input');
      var sendEl = root.querySelector('.ds-send');
      var chipThink = root.querySelector('.ds-chip[data-cap="think"]');
      var chipSearch = root.querySelector('.ds-chip[data-cap="search"]');
      var fileEl = root.querySelector('.ds-file');

      /* ---------- 运行期引用 ---------- */
      var currentFeed = null;
      var currentThink = null;      // 最后一条（正在读的）思考框
      var currentMeta = null;
      var stickyToggle = null;
      var foldBtn = null;
      var readOnlyOverride = null;  // 老板键期间临时覆盖净读状态
      var savedReadOnly = false;

      /* ============================================================
         侧边栏
         ============================================================ */
      function renderHistory() {
        histEl.innerHTML = historyHtml(api, searchInput.value);
        searchLabel.classList.toggle('has-value', !!searchInput.value.trim());
      }

      function renderThread() {
        var conv = api.activeConv;
        var list = api.chat.exchanges;          // 首次读取时按需生成并落盘
        titleEl.textContent = conv ? conv.title : '新的对话';

        // 清空后重建：所有交互都走 root 上的事件委托，不需要重新绑监听
        innerEl.innerHTML = '';
        currentFeed = null;
        currentThink = null;
        currentMeta = null;
        stickyToggle = null;
        foldBtn = null;

        if (!list.length) {
          stageEl.classList.add('is-welcome');
          applyReadOnly();
          return;
        }
        stageEl.classList.remove('is-welcome');

        var open = !!api.mask.openThinking;
        var html =
          '<div class="ds-sticky">' +
            '<button class="ds-think-toggle" type="button" data-open="' + (open ? '1' : '0') + '">' +
              '<span class="ds-think-icon">' + SPARK + '</span>' +
              '<span class="ds-think-label">深度思考</span>' +
              '<span class="ds-think-meta">已思考（用时 12 秒）</span>' +
              CHEVRON +
            '</button>' +
            '<button class="ds-fold-all" type="button" data-on="0" ' +
              'title="净读：折叠对话双方正文，只留「深度思考」里的正文">' +
              FOLD + '<span>净读</span></button>' +
          '</div>';

        list.forEach(function (item, i) {
          html += userNode(item.q);
          html += aiNode(api.richText(item.a), i === list.length - 1);
        });
        innerEl.innerHTML = html;

        stickyToggle = innerEl.querySelector('.ds-think-toggle');
        foldBtn = innerEl.querySelector('.ds-fold-all');

        var last = innerEl.querySelector('.ds-ai-msg:last-child');
        currentThink = last.querySelector('.ds-think');
        currentMeta = last.querySelector('.ds-think-meta');
        currentThink.dataset.open = open ? '1' : '0';

        // 展开态：正文框带着阅读位置一起出现，读者不会丢位置
        // 收起态：视野拉到最新的伪装回答上，屏幕上只有问答
        currentFeed = api.mountThinking(currentThink.querySelector('.ds-think-body'),
          threadEl, { noRestore: !open });

        syncSticky(open);
        applyReadOnly();
        refreshMeta();
        if (!open) threadEl.scrollTop = threadEl.scrollHeight;
      }

      function userNode(text) {
        return '<div class="ds-msg ds-user-msg"><div class="ds-bubble">' + esc(text) + '</div></div>';
      }

      function aiNode(answerHtml, isLast) {
        return '' +
          '<div class="ds-msg ds-ai-msg">' +
            '<div class="ds-ai-avatar">' + WHALE + '</div>' +
            '<div class="ds-ai-body">' +
              '<div class="ds-think" data-open="0"' + (isLast ? ' data-last="1"' : '') + '>' +
                '<button class="ds-think-head" type="button">' +
                  '<span class="ds-think-icon">' + SPARK + '</span>' +
                  '<span class="ds-think-label">深度思考</span>' +
                  '<span class="ds-think-meta">已思考（用时 12 秒）</span>' +
                  CHEVRON +
                '</button>' +
                '<div class="ds-think-body"></div>' +
              '</div>' +
              '<div class="ds-answer">' + answerHtml + '</div>' +
              ACTIONS +
            '</div>' +
          '</div>';
      }

      /* ============================================================
         置顶折叠条 / 净读
         ============================================================ */
      function syncSticky(open) {
        if (stickyToggle) stickyToggle.dataset.open = open ? '1' : '0';
      }

      function collapseAllThink() {
        Array.prototype.forEach.call(innerEl.querySelectorAll('.ds-think'), function (t) {
          t.dataset.open = '0';
        });
        syncSticky(false);
      }

      function openActiveThink() {
        if (currentThink) currentThink.dataset.open = '1';
        syncSticky(true);
      }

      function toggleActiveThink() {
        if (!currentThink) return;
        var open = currentThink.dataset.open !== '1';
        currentThink.dataset.open = open ? '1' : '0';
        syncSticky(open);
        if (open && currentFeed) currentFeed.ensureMore();
      }

      function isReadOnly() {
        return readOnlyOverride === null ? !!api.mask.readOnly : readOnlyOverride;
      }

      function applyReadOnly() {
        var on = isReadOnly();
        threadEl.dataset.readonly = on ? '1' : '0';
        if (foldBtn) foldBtn.dataset.on = on ? '1' : '0';
      }

      /* ============================================================
         伪装文案
         ============================================================ */
      function refreshMeta() {
        if (!currentMeta) return;
        var text = '已思考（用时 ' + (8 + Math.round(api.progressPercent() * 0.9)) + ' 秒）';
        currentMeta.textContent = text;
        var stickyMeta = innerEl.querySelector('.ds-think-toggle .ds-think-meta');
        if (stickyMeta) stickyMeta.textContent = text;
      }

      /* ============================================================
         发送
         ============================================================ */
      function send() {
        var text = inputEl.value.trim();
        var item = text ? api.makeExchange({ q: text }) : api.makeExchange();
        if (!item) return;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendEl.dataset.ready = '0';
        renderThread();                  // 重建后保持阅读位置
        renderHistory();
        if (currentFeed) currentFeed.ensureMore();
      }

      /* ============================================================
         事件
         ============================================================ */
      function onRootClick(e) {
        var t = e.target;

        if (t.closest('.ds-newchat')) {
          api.chat.create();
          renderThread();
          renderHistory();
          inputEl.focus();
          return;
        }
        if (t.closest('.ds-side-collapse') || t.closest('.ds-open-side')) {
          api.setSidebar(!api.isSidebarOpen());
          dsEl.dataset.side = api.isSidebarOpen() ? 'open' : 'closed';
          return;
        }
        if (t.closest('.ds-open-console') || t.closest('.ds-user')) {
          NF.bus.emit('open-console');
          return;
        }
        if (t.closest('.ds-search-clear')) {
          searchInput.value = '';
          renderHistory();
          return;
        }
        var hist = t.closest('.ds-hist-item');
        if (hist) {
          if (api.chat.select(hist.dataset.conv)) {
            renderThread();
            renderHistory();
          }
          return;
        }
        if (t.closest('.ds-think-toggle')) { toggleActiveThink(); return; }
        if (t.closest('.ds-fold-all')) { api.setReadOnly(!api.isReadOnly()); return; }

        var head = t.closest('.ds-think-head');
        if (head) {
          var think = head.closest('.ds-think');
          var open = think.dataset.open !== '1';
          think.dataset.open = open ? '1' : '0';
          if (think === currentThink) syncSticky(open);
          return;
        }

        if (t.closest('.ds-chip[data-cap="think"]')) {
          var thinkOn = !api.mask.openThinking;
          api.setOpenThinking(thinkOn);
          if (currentThink) {
            currentThink.dataset.open = thinkOn ? '1' : '0';
            syncSticky(thinkOn);
            if (thinkOn && currentFeed) currentFeed.ensureMore();
          }
          return;
        }
        if (t.closest('.ds-chip[data-cap="search"]')) {
          api.setWebSearch(!api.mask.webSearch);
          return;
        }
        if (t.closest('.ds-send')) { send(); return; }
        if (t.closest('[data-act="attach"]')) { fileEl.click(); return; }

        var act = t.closest('.ds-act');
        if (act) {
          act.classList.add('is-hit');
          setTimeout(function () { act.classList.remove('is-hit'); }, 400);
        }
      }

      function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }

      function onInput() {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 168) + 'px';
        sendEl.dataset.ready = inputEl.value.trim() ? '1' : '0';
      }

      var debouncedHistory = NF.util.debounce(renderHistory, 140);
      function onSearch() {
        api.setSidebarQuery(searchInput.value);
        debouncedHistory();
      }

      function onFileChange() {
        if (this.files && this.files[0]) api.loadNovelFile(this.files[0]);
        this.value = '';
      }

      root.addEventListener('click', onRootClick);
      inputEl.addEventListener('keydown', onKeyDown);
      inputEl.addEventListener('input', onInput);
      searchInput.addEventListener('input', onSearch);
      fileEl.addEventListener('change', onFileChange);

      /* ============================================================
         订阅
         ============================================================ */
      var offPanic = api.on('panic', function (p) {
        if (p) {
          // 净读态下如果再收起思考框，两边都被折叠会变成一片空白
          savedReadOnly = isReadOnly();
          if (savedReadOnly) { readOnlyOverride = false; applyReadOnly(); }
          collapseAllThink();
          threadEl.scrollTop = threadEl.scrollHeight;
        } else {
          if (savedReadOnly) { readOnlyOverride = null; applyReadOnly(); }
          openActiveThink();
        }
      });

      var offProgress = api.on('progress', refreshMeta);

      /* 控制台改了阅读/伪装参数后同步界面 */
      var offMask = api.on('mask', function () {
        applyReadOnly();
        chipThink.classList.toggle('is-on', !!api.mask.openThinking);
        chipSearch.classList.toggle('is-on', !!api.mask.webSearch);
      });
      var offConv = api.on('conv', function () { renderHistory(); });
      /* 控制台插入了模板问答 / 快捷键切换了会话 */
      var offReload = api.on('thread-reload', function () {
        renderThread();
        renderHistory();
      });
      /* ⌘/Ctrl+B 由核心统一处理，皮肤只负责把边栏推回去 */
      var offSidebar = api.on('sidebar', function (open) {
        dsEl.dataset.side = open ? 'open' : 'closed';
      });

      /* ============================================================
         挂载
         ============================================================ */
      renderHistory();
      renderThread();
      searchInput.value = api.sidebarQuery();
      renderHistory();
      api.toast('小说在「深度思考」里 · Esc 一键收起');

      CLEANUP = [
        function () {
          root.removeEventListener('click', onRootClick);
          inputEl.removeEventListener('keydown', onKeyDown);
          inputEl.removeEventListener('input', onInput);
          searchInput.removeEventListener('input', onSearch);
          fileEl.removeEventListener('change', onFileChange);
          offPanic(); offProgress(); offMask(); offConv(); offReload(); offSidebar();
        }
      ];
    },

    unmount: function () {
      CLEANUP.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
      CLEANUP = [];
    }
  });
})(window.NovelFish);
