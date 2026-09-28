/* ============================================================
   skins/gpt.js — 伪装成 GPT 桌面端
   正文位置：「已深度思考」折叠段
   与 deepseek.js 共用核心提供的 mountThinking，代码量≈ 骨架 + 事件
   ============================================================ */
(function (NF) {
  'use strict';

  var FAVICON =
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="16" cy="16" r="15" fill="#0d0d0d"/>' +
    '<path d="M16 7.5l6.4 3.7v7.4L16 22.3l-6.4-3.7v-7.4L16 7.5z" fill="none" stroke="#fff" stroke-width="1.8"/>' +
    '<circle cx="16" cy="15.5" r="2.2" fill="#fff"/></svg>';

  var CHEVRON =
    '<svg class="gpt-chev" viewBox="0 0 24 24" width="14" height="14">' +
    '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CLEANUP = [];

  NF.defineSkin({
    id: 'gpt',
    name: 'GPT 桌面端',
    brand: { color: '#10A37F', letter: 'G' },
    desc: '伪装成 GPT 桌面端，「已深度思考」折叠段里放正文',
    shell: {
      url: 'chatgpt.com',
      title: 'ChatGPT',
      favicon: FAVICON
    },

    mount: function (root, api) {
      var U = NF.util;
      var esc = U.escapeHtml;

      root.innerHTML =
        '<div class="gpt">' +
          '<aside class="gpt-side">' +
            '<div class="gpt-side-head">' +
              '<button class="gpt-new" type="button"><i>+</i> 新建聊天</button>' +
              '<button class="gpt-side-icon" type="button" title="搜索">' +
                '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm8.5 14.5L14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
            '</div>' +
            '<nav class="gpt-hist">' + buildHistory(api) + '</nav>' +
            '<div class="gpt-side-foot">' +
              '<button class="gpt-user" type="button" title="设置">' +
                '<span class="gpt-avatar"></span>' +
                '<span class="gpt-user-name"></span>' +
              '</button>' +
            '</div>' +
          '</aside>' +
          '<main class="gpt-main">' +
            '<header class="gpt-top">' +
              '<button class="gpt-model" type="button">ChatGPT 5 ' + CHEVRON + '</button>' +
              '<button class="gpt-icon gpt-open-console" type="button" title="设置">&#8943;</button>' +
            '</header>' +
            '<div class="gpt-thread" data-role="thread"><div class="gpt-thread-inner"></div></div>' +
            '<div class="gpt-composer">' +
              '<div class="gpt-input-wrap">' +
                '<textarea class="gpt-input" rows="1" placeholder="询问任何问题"></textarea>' +
                '<div class="gpt-tools">' +
                  '<button class="gpt-round" type="button" title="添加文件">' +
                    '<svg viewBox="0 0 24 24" width="17" height="17"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
                  '<span class="gpt-tools-right">' +
                    '<button class="gpt-round" type="button" title="语音">' +
                      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm7 9a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>' +
                    '<button class="gpt-send" type="button" title="发送">' +
                      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
                  '</span>' +
                '</div>' +
              '</div>' +
              '<div class="gpt-disclaimer">ChatGPT 也可能会犯错。请核查重要信息。</div>' +
            '</div>' +
          '</main>' +
        '</div>';

      var thread = root.querySelector('.gpt-thread');
      var inner = root.querySelector('.gpt-thread-inner');
      var input = root.querySelector('.gpt-input');
      var histEl = root.querySelector('.gpt-hist');

      var currentThink = null;
      var currentMeta = null;

      function refreshHistory() { histEl.innerHTML = buildHistory(api); }

      /* 左下角账户行跟随浏览器资料（设置 → 外观 可改），不写死名字 */
      function syncAccount() {
        var b = api.browserProfile();
        var av = root.querySelector('.gpt-avatar');
        var nm = root.querySelector('.gpt-user-name');
        if (!av || !nm) return;
        if (b.avatar) {
          av.classList.add('has-img');
          av.innerHTML = '<img alt="" src="' + esc(b.avatar) + '">';
          av.style.background = 'transparent';
        } else {
          av.classList.remove('has-img');
          av.textContent = (String(b.name || '?').trim().charAt(0)) || '?';
          av.style.background = b.avatarColor || '#0d0d0d';
        }
        nm.textContent = b.name;
      }

      function userNode(text) {
        return '<div class="gpt-msg gpt-user-msg"><div class="gpt-bubble">' + esc(text) + '</div></div>';
      }

      function aiNode(answerHtml) {
        return '' +
          '<div class="gpt-msg gpt-ai-msg">' +
            '<div class="gpt-ai-avatar">' + FAVICON + '</div>' +
            '<div class="gpt-ai-body">' +
              '<button class="gpt-think-head" type="button">' +
                '<span class="gpt-think-meta">已深度思考（用时 12 秒）</span>' + CHEVRON +
              '</button>' +
              '<div class="gpt-think"></div>' +
              '<div class="gpt-answer">' + answerHtml + '</div>' +
              '<div class="gpt-acts">' +
                '<button class="gpt-act" type="button" title="复制">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
                '<button class="gpt-act" type="button" title="有帮助">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M7 21V10l4.5-7 .9.5c.9.5 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
                '<button class="gpt-act" type="button" title="没帮助">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15" style="transform:rotate(180deg)"><path d="M7 21V10l4.5-7 .9.5c.9.5 1.3 1.5 1 2.5L12 10h5.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.3 21H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10H4v11h3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>' +
              '</div>' +
            '</div>' +
          '</div>';
      }

      function collapseAll() {
        Array.prototype.forEach.call(root.querySelectorAll('.gpt-msg'), function (m) {
          m.dataset.open = '0';
        });
      }

      function appendExchange(item) {
        collapseAll();
        inner.insertAdjacentHTML('beforeend', userNode(item.q));
        inner.insertAdjacentHTML('beforeend', aiNode(api.richText(item.a)));
        var msg = inner.lastElementChild;
        msg.dataset.open = api.mask.openThinking ? '1' : '0';
        currentThink = msg;
        currentMeta = msg.querySelector('.gpt-think-meta');
        api.mountThinking(msg.querySelector('.gpt-think'), thread, { noRestore: true });
        thread.scrollTop = thread.scrollHeight;
      }

      function rebuild(seedNew) {
        inner.innerHTML = '';

        // 新建聊天走核心的会话模型，侧边栏列表才会同步长出来
        if (seedNew) api.chat.create();
        var list = api.exchanges;
        if (!list.length) {
          api.makeExchange();
          list = api.exchanges;
        }

        list.forEach(function (item, i) {
          collapseAll();
          inner.insertAdjacentHTML('beforeend', userNode(item.q));
          inner.insertAdjacentHTML('beforeend', aiNode(api.richText(item.a)));
          var msg = inner.lastElementChild;
          var isLast = i === list.length - 1;
          msg.dataset.open = (isLast && api.mask.openThinking) ? '1' : '0';
          if (isLast) {
            currentThink = msg;
            currentMeta = msg.querySelector('.gpt-think-meta');
            api.mountThinking(msg.querySelector('.gpt-think'), thread,
              { noRestore: !api.mask.openThinking });
          }
        });
        if (!api.mask.openThinking) thread.scrollTop = thread.scrollHeight;
      }

      /* ---------- 事件 ---------- */
      function onRootClick(e) {
        if (e.target.closest('.gpt-think-head')) {
          var msg = e.target.closest('.gpt-msg');
          msg.dataset.open = msg.dataset.open === '1' ? '0' : '1';
          return;
        }
        if (e.target.closest('.gpt-open-console') || e.target.closest('.gpt-user')) {
          NF.bus.emit('open-console');
          return;
        }
        if (e.target.closest('.gpt-new')) {
          api.toast('已新建聊天，阅读位置不变');
          rebuild(true);
          return;
        }
        var hist = e.target.closest('.gpt-hist-item');
        if (hist && hist.dataset.conv) {
          api.chat.select(hist.dataset.conv);
          refreshHistory();
          rebuild(false);
        }
      }

      function send() {
        appendExchange(api.makeExchange(input.value.trim() ? { q: input.value.trim() } : undefined));
        refreshHistory();
        input.value = '';
        input.style.height = 'auto';
      }

      root.addEventListener('click', onRootClick);
      root.querySelector('.gpt-send').addEventListener('click', send);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 168) + 'px';
      });

      var offPanic = api.on('panic', function (p) {
        if (p) {
          collapseAll();
          thread.scrollTop = thread.scrollHeight;
        } else if (currentThink) {
          currentThink.dataset.open = '1';
        }
      });

      var offProgress = api.on('progress', function (info) {
        if (!currentMeta) return;
        currentMeta.textContent = '已深度思考（用时 ' + (8 + Math.round(info.percent * 0.9)) + ' 秒）';
      });

      var offConv = api.on('conv', refreshHistory);
      var offProfile = api.on('browser-profile', syncAccount);

      syncAccount();
      rebuild(false);
      if (api.firstRun('novel-hint')) api.toast('小说在「已深度思考」里 · Esc 一键收起');

      CLEANUP = [function () {
        root.removeEventListener('click', onRootClick);
        offPanic(); offProgress(); offConv(); offProfile();
      }];
    },

    unmount: function () {
      CLEANUP.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
      CLEANUP = [];
    }
  });

  function buildHistory(api) {
    var groups = api.chat.groups();
    if (!groups.length) return '<div class="gpt-hist-empty">还没有对话</div>';
    return groups.map(function (g) {
      return '<div class="gpt-hist-group">' +
        '<div class="gpt-hist-label">' + g.label + '</div>' +
        g.items.map(function (it) {
          return '<div class="gpt-hist-item' + (it.active ? ' is-active' : '') +
            '" data-conv="' + NF.util.escapeHtml(it.id) + '">' +
            NF.util.escapeHtml(it.title) + '</div>';
        }).join('') +
        '</div>';
    }).join('');
  }
})(window.NovelFish);
