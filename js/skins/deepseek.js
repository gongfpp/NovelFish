/* ============================================================
   skins/deepseek.js — 伪装成 Chrome 打开 chat.deepseek.com
   正文位置：「深度思考」折叠框
   伪装位置：用户提问气泡 + AI 回答正文
   ============================================================ */
(function (NF) {
  'use strict';

  var FAVICON =
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="32" height="32" rx="8" fill="#4D6BFE"/>' +
    '<path d="M9 22V10h4.2c3.6 0 5.8 2.1 5.8 5.6S16.8 22 13.2 22H9zm3-2.4h1.1c1.7 0 2.8-1.2 2.8-3.1s-1.1-3.1-2.8-3.1H12v6.2z" fill="white"/>' +
    '<circle cx="22.5" cy="20.5" r="2" fill="white"/></svg>';

  var CHEVRON =
    '<svg class="ds-chev" viewBox="0 0 24 24" width="14" height="14">' +
    '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CLEANUP = [];

  NF.defineSkin({
    id: 'deepseek',
    name: 'DeepSeek',
    brand: { color: '#4D6BFE', letter: 'D' },
    desc: '伪装成 Chrome 打开 chat.deepseek.com，正文藏进「深度思考」',
    shell: {
      url: 'chat.deepseek.com',
      title: 'DeepSeek - 探索未至之境',
      favicon: FAVICON
    },

    mount: function (root, api) {
      var U = NF.util;
      var esc = U.escapeHtml;

      /* ---------- 骨架 ---------- */
      var hist = buildHistory(api);

      root.innerHTML =
        '<div class="ds">' +
          '<aside class="ds-side">' +
            '<div class="ds-side-top">' +
              '<div class="ds-logo"><span class="ds-mark">' + FAVICON + '</span>' +
                '<span class="ds-logo-text">deepseek</span></div>' +
              '<button class="ds-newchat" type="button"><span>+</span> 新对话</button>' +
              '<div class="ds-search"><svg viewBox="0 0 24 24" width="14" height="14">' +
                '<path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm8.5 14.5L14 14" fill="none" ' +
                'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
                '<span>搜索</span></div>' +
            '</div>' +
            '<nav class="ds-hist">' + hist + '</nav>' +
            '<div class="ds-side-foot">' +
              '<button class="ds-user" type="button" title="设置">' +
                '<span class="ds-avatar">摸</span>' +
                '<span class="ds-user-name">摸鱼的人</span>' +
              '</button>' +
            '</div>' +
          '</aside>' +
          '<main class="ds-main">' +
            '<header class="ds-top">' +
              '<span class="ds-model">DeepSeek-V3.2</span>' +
              '<span class="ds-top-actions">' +
                '<button class="ds-ghost-btn" type="button">分享</button>' +
                '<button class="ds-icon-btn ds-open-console" type="button" title="设置">&#8943;</button>' +
              '</span>' +
            '</header>' +
            '<div class="ds-thread" data-role="thread"><div class="ds-thread-inner"></div></div>' +
            '<div class="ds-composer">' +
              '<div class="ds-input-wrap">' +
                '<textarea class="ds-input" rows="1" placeholder="给 DeepSeek 发送消息"></textarea>' +
                '<div class="ds-input-tools">' +
                  '<span class="ds-tool-group">' +
                    '<button class="ds-pill is-on" type="button">' +
                      '<span class="ds-pill-dot"></span>深度思考 (R1)</button>' +
                    '<button class="ds-pill" type="button">联网搜索</button>' +
                  '</span>' +
                  '<span class="ds-tool-right">' +
                    '<button class="ds-icon-btn" type="button" title="附件">' +
                      '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M16.5 6.5l-7 7a3 3 0 0 0 4.2 4.2l7-7a5 5 0 0 0-7-7l-7.3 7.3a7 7 0 0 0 9.9 9.9l6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>' +
                    '<button class="ds-send" type="button" title="发送">' +
                      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 19V6M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
                  '</span>' +
                '</div>' +
              '</div>' +
              '<div class="ds-disclaimer">内容由 AI 生成，请仔细甄别</div>' +
            '</div>' +
          '</main>' +
        '</div>';

      var thread = root.querySelector('.ds-thread');
      var inner = root.querySelector('.ds-thread-inner');
      var input = root.querySelector('.ds-input');

      /* ---------- 消息节点 ---------- */
      function userNode(text) {
        return '<div class="ds-msg ds-user-msg"><div class="ds-bubble">' + esc(text) + '</div></div>';
      }

      function aiNode(answerHtml) {
        return '' +
          '<div class="ds-msg ds-ai-msg">' +
            '<div class="ds-ai-avatar">' + FAVICON + '</div>' +
            '<div class="ds-ai-body">' +
              '<div class="ds-think" data-open="1">' +
                '<button class="ds-think-head" type="button">' +
                  '<span class="ds-think-icon">' + FAVICON + '</span>' +
                  '<span class="ds-think-label">深度思考</span>' +
                  '<span class="ds-think-meta">已思考（用时 12 秒）</span>' +
                  CHEVRON +
                '</button>' +
                '<div class="ds-think-body"></div>' +
              '</div>' +
              '<div class="ds-answer">' + answerHtml + '</div>' +
              '<div class="ds-msg-actions">' +
                '<button class="ds-act" type="button" title="复制">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
                '<button class="ds-act" type="button" title="有帮助">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M7 21V10l4.5-7 .9.5c.9.5 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
                '<button class="ds-act" type="button" title="没帮助">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15" style="transform:rotate(180deg)"><path d="M7 21V10l4.5-7 .9.5c.9 1 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
                '<button class="ds-act" type="button" title="重新生成">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
              '</div>' +
            '</div>' +
          '</div>';
      }

      /* ---------- 追加一条伪装问答 ---------- */
      function appendExchange(item, opts) {
        opts = opts || {};
        collapseAllThink();
        inner.insertAdjacentHTML('beforeend', userNode(item.q));
        inner.insertAdjacentHTML('beforeend', aiNode(api.richText(item.a)));

        var msg = inner.lastElementChild;
        var think = msg.querySelector('.ds-think');
        var body = msg.querySelector('.ds-think-body');

        var open = opts.open !== undefined ? opts.open : !!api.mask.openThinking;
        think.dataset.open = open ? '1' : '0';

        var feed = api.mountThinking(body, thread, { noRestore: true });
        currentFeed = feed;
        currentMeta = msg.querySelector('.ds-think-meta');
        currentThink = think;

        thread.scrollTop = thread.scrollHeight;
        return feed;
      }

      function collapseAllThink() {
        Array.prototype.forEach.call(root.querySelectorAll('.ds-think'), function (t) {
          t.dataset.open = '0';
        });
      }

      function openActiveThink() {
        if (currentThink) currentThink.dataset.open = '1';
      }

      /* ---------- 状态 ---------- */
      var currentFeed = null;
      var currentMeta = null;
      var currentThink = null;

      /* ---------- 首次渲染 / 恢复历史对话 ---------- */
      function rebuild(seedNew) {
        inner.innerHTML = '';
        var list = api.exchanges;
        if (!list.length || seedNew) {
          list.length = 0;
          NF.camouflage.reset(0);
        }
        if (!list.length) {
          api.makeExchange();
        }
        list.forEach(function (item, i) {
          var isLast = i === list.length - 1;
          collapseAllThink();
          inner.insertAdjacentHTML('beforeend', userNode(item.q));
          inner.insertAdjacentHTML('beforeend', aiNode(api.richText(item.a)));
          var msg = inner.lastElementChild;
          var think = msg.querySelector('.ds-think');
          think.dataset.open = (isLast && api.mask.openThinking) ? '1' : '0';
          if (isLast) {
            currentThink = think;
            currentMeta = msg.querySelector('.ds-think-meta');
            currentFeed = api.mountThinking(msg.querySelector('.ds-think-body'), thread,
              { noRestore: !api.mask.openThinking });
          }
        });
        // 展开态下交给 feed 负责定位；收起态才需要把视野拉到最新消息
        if (!api.mask.openThinking) thread.scrollTop = thread.scrollHeight;
      }

      /* ---------- 交互 ---------- */
      function onRootClick(e) {
        var head = e.target.closest('.ds-think-head');
        if (head) {
          var think = head.closest('.ds-think');
          think.dataset.open = think.dataset.open === '1' ? '0' : '1';
          return;
        }
        if (e.target.closest('.ds-open-console') || e.target.closest('.ds-user')) {
          NF.bus.emit('open-console');
          return;
        }
        if (e.target.closest('.ds-newchat')) {
          api.toast('已开启新对话，阅读位置不变');
          NF.store.save();
          rebuild(true);
          return;
        }
      }

      function send() {
        var item = api.makeExchange();
        appendExchange(item);
        input.value = '';
        input.style.height = 'auto';
      }

      function onInputKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }

      function onInputInput() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 168) + 'px';
      }

      root.addEventListener('click', onRootClick);
      root.querySelector('.ds-send').addEventListener('click', send);
      input.addEventListener('keydown', onInputKey);
      input.addEventListener('input', onInputInput);

      /* ---------- 老板键 ---------- */
      var offPanic = api.on('panic', function (p) {
        if (p) {
          collapseAllThink();
          thread.scrollTop = thread.scrollHeight;
        } else {
          openActiveThink();
        }
      });

      /* ---------- 阅读进度 → 伪装文案 ---------- */
      var offProgress = api.on('progress', function (info) {
        if (!currentMeta) return;
        currentMeta.textContent = '已思考（用时 ' + (8 + Math.round(info.percent * 0.9)) + ' 秒）';
      });

      /* ---------- 点踩区：短暂反馈，保持"在使用"的观感 ---------- */
      root.addEventListener('click', function (e) {
        var act = e.target.closest('.ds-act');
        if (!act) return;
        act.classList.add('is-hit');
        setTimeout(function () { act.classList.remove('is-hit'); }, 400);
      });

      /* ---------- 挂载 ---------- */
      rebuild(false);
      api.toast('小说在「深度思考」里 · Esc 一键收起');

      CLEANUP = [
        function () { root.removeEventListener('click', onRootClick); offPanic(); offProgress(); }
      ];
    },

    unmount: function () {
      CLEANUP.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
      CLEANUP = [];
    }
  });

  /* ============================================================
     侧边栏「最近对话」标题取自伪装剧本，看起来就是日常工作
     ============================================================ */
  function buildHistory(api) {
    var titles = api.historyTitles(11);
    var groups = [
      { label: '今天', items: titles.slice(0, 3) },
      { label: '昨天', items: titles.slice(3, 6) },
      { label: '7 天内', items: titles.slice(6, 11) }
    ];
    return groups.map(function (g) {
      if (!g.items.length) return '';
      return '<div class="ds-hist-group">' +
        '<div class="ds-hist-label">' + g.label + '</div>' +
        g.items.map(function (t, i) {
          return '<div class="ds-hist-item' + (g.label === '今天' && i === 0 ? ' is-active' : '') + '">' +
            NF.util.escapeHtml(t) + '</div>';
        }).join('') +
        '</div>';
    }).join('');
  }
})(window.NovelFish);
