/* ============================================================
   skins/deepseek.js — 伪装成浏览器打开 chat.deepseek.com

   设计前提：**除了「深度思考」里藏着小说，其余必须和官网一模一样**。
   所以这里只做官网有的东西，不加任何自造功能：
     · 侧栏：新对话 / 搜索（⌘J）/ 分组会话列表 / 底部账户行
     · 顶栏：标题 + 分享（打开官网规格的分享弹窗；小说摊在屏幕上时，
            创建的链接会把这本书一起带走，见 share.js）
     · 消息：用户气泡、助手「深度思考」折叠块、悬停才出现的操作条
     · 输入区：textarea + 深度思考/智能搜索 能力开关 + 附件 + 发送

   正文位置：助手消息里的「深度思考」正文容器。
   吸顶方式：思考块的表头本身 position:sticky 冻结在消息区顶部，
             滚动正文时一直在最上面。点表头 = 开合（官网原本的交互）；
             老板键（Ctrl+D）走核心，只收不放，点表头即回到阅读位置。
   ============================================================ */
(function (NF) {
  'use strict';

  /* ---------------- 官方标识 ----------------
     取自 https://fe-static.deepseek.com/chat/favicon.svg （viewBox 0 0 50 50） */
  var WHALE_D =
    'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 ' +
    '47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 ' +
    '41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 ' +
    '10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 ' +
    '7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 ' +
    '8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 ' +
    '18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 ' +
    '21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 ' +
    '16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 ' +
    '10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 ' +
    '7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 ' +
    '9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 ' +
    '18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 ' +
    '42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 ' +
    '39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 ' +
    '39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 ' +
    '33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 ' +
    '19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 ' +
    '16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 ' +
    '37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 ' +
    '34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 ' +
    '37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 ' +
    '30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 ' +
    '20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 ' +
    '25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 ' +
    '37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 ' +
    '37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 ' +
    '23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 ' +
    '24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 ' +
    '26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 ' +
    '28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 ' +
    '26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 ' +
    '23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 ' +
    '22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 ' +
    '21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 ' +
    '23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 ' +
    '26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z';

  function whale(size, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 50 50" width="' + size + '" height="' + size +
      '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="' + WHALE_D +
      '" fill="#4D6BFE"/></svg>';
  }

  var WHALE = whale(24);
  var FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="' + WHALE_D + '" fill="#4D6BFE"/></svg>'
  );

  /* ---------------- 线性图标 ---------------- */
  function line(d, size, w) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' +
      (w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function solid(d, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" aria-hidden="true"><path d="' + d + '" fill="currentColor"/></svg>';
  }

  var ICON = {
    chevron: line('M6 9.5l6 6 6-6', 14, 1.9),
    /* 能力开关的图标：官网 .ds-toggle-button--m 的 --dsl-toggle-button-icon-size = 14px */
    spark: line('M12 3.5l1.7 4.4 4.4 1.7-4.4 1.7L12 15.7l-1.7-4.4L5.9 9.6l4.4-1.7L12 3.5zM18.6 15.4l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z', 14, 1.5),
    globe: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.8 12h16.4M12 3.8c2.6 2.4 2.6 14 0 16.4M12 3.8c-2.6 2.4-2.6 14 0 16.4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    panel: line('M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5zM9.6 5.5v13', 18, 1.6),
    plus: line('M12 5.5v13M5.5 12h13', 16, 1.8),
    search: line('M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.2 15.2L20 20', 15, 1.8),
    more: solid('M12 6.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zm0 7.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zm0 7.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z', 16),
    share: line('M12 15.5V4M8.2 7.6L12 3.8l3.8 3.8M5 14.5v4.2a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-4.2', 15, 1.7),
    copy: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 15.2V6.4A1.9 1.9 0 0 1 7.4 4.5h8.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    regen: line('M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 5.5V10h-4.5', 15, 1.7),
    up: line('M7 20.5v-9.4l4.3-6.6.85.45c.85.45 1.25 1.4.95 2.3L12 10h5.4a1.9 1.9 0 0 1 1.9 2.25l-1.15 5.7a1.9 1.9 0 0 1-1.88 1.55H7zM7 11.1H4.4v9.4H7', 15, 1.6),
    down: '<svg viewBox="0 0 24 24" width="15" height="15" style="transform:rotate(180deg)" aria-hidden="true"><path d="M7 20.5v-9.4l4.3-6.6.85.45c.85.45 1.25 1.4.95 2.3L12 10h5.4a1.9 1.9 0 0 1 1.9 2.25l-1.15 5.7a1.9 1.9 0 0 1-1.88 1.55H7zM7 11.1H4.4v9.4H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    attach: line('M16.5 7.2l-7.2 7.2a3 3 0 0 0 4.2 4.2l7.2-7.2a5 5 0 0 0-7-7l-7.4 7.4a7 7 0 0 0 9.9 9.9l6-6', 16, 1.9),
    send: solid('M12 3.6l5.6 12.6a.7.7 0 0 1-.94.92L12 15.6l-4.66 1.52a.7.7 0 0 1-.94-.92L12 3.6z', 16),
    settings: line('M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2v.17a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.96-1.15l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.6 15H3.4a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.1l-.06-.06A2 2 0 1 1 7.4 5.2l.06.06a1.7 1.7 0 0 0 2.9-1.2V3.9a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 2.96 1.15l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0 1.2 2.9h.17a2 2 0 1 1 0 4h-.09', 16, 1.6),
    logout: line('M15 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2.5M10 12h10.5M17.5 8.6L21 12l-3.5 3.4', 16, 1.7),
    check: solid('M9.6 16.3l-4.2-4.2-1.5 1.5 5.7 5.7 12-12-1.5-1.5-10.5 10.5z', 16)
  };

  var CLEANUP = [];
  var SHARE_LINK = '';

  /* ---------------- 侧栏会话列表 ---------------- */
  function historyHtml(api, query) {
    var groups = api.chat.groups(query);
    if (!groups.length) return '<div class="ds-hist-empty">没有匹配的对话</div>';
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

  /* ---------------- 消息节点 ---------------- */
  function actionsHtml(which, i) {
    var btns;
    if (which === 'user') {
      btns = act('copy', '复制', ICON.copy);
    } else {
      btns = act('copy', '复制', ICON.copy) +
             act('regen', '重新生成', ICON.regen) +
             act('up', '有帮助', ICON.up) +
             act('down', '没帮助', ICON.down);
    }
    return '<div class="ds-msg-actions" data-idx="' + i + '">' + btns + '</div>';
  }

  function act(kind, title, svg) {
    return '<button class="ds-act" type="button" data-act="' + kind + '" title="' + title + '">' + svg + '</button>';
  }

  function userNode(item, i) {
    return '<div class="ds-msg ds-user-msg" data-idx="' + i + '">' +
      '<div class="ds-bubble">' + NF.util.escapeHtml(item.q) + '</div>' +
      actionsHtml('user', i) +
      '</div>';
  }

  /**
   * 助手消息。
   * 「深度思考」里放什么，取决于这条是哪种模式：
   *   novel —— 容器留空，正文由阅读引擎挂进来（只挂在最新的一条上）
   *   model —— 放模型真实吐出来的推理原文
   * 表头文案也跟着走：流式当中是「思考中…」，落定后才是「已深度思考（用时 N 秒）」。
   */
  function aiNode(item, i, isLast, elapsedOf) {
    var open = isLast && item.thinkOpen !== false;
    var streamed = item.mode === 'model' ? String(item.reasoning || '') : '';
    var body = streamed
      ? '<div class="ds-think-text">' + NF.util.escapeHtml(streamed) + '</div>'
      : '';
    var label = item.elapsed
      ? '已深度思考（用时 ' + item.elapsed + ' 秒）'
      : '已深度思考（用时 ' + elapsedOf(i) + ' 秒）';

    return '<div class="ds-msg ds-ai-msg" data-idx="' + i + '" data-mode="' + item.mode + '">' +
      '<div class="ds-think" data-open="' + (open ? '1' : '0') + '" data-mode="' + item.mode + '">' +
        '<button class="ds-think-head" type="button">' +
          '<span class="ds-think-icon">' + ICON.spark + '</span>' +
          '<span class="ds-think-label">' + label + '</span>' +
          '<span class="ds-chev">' + ICON.chevron + '</span>' +
        '</button>' +
        '<div class="ds-think-body">' + body + '</div>' +
      '</div>' +
      '<div class="ds-markdown ds-answer">' + NF.util.richText(item.a || '') + '</div>' +
      actionsHtml('ai', i) +
      '</div>';
  }

  NF.defineSkin({
    id: 'deepseek',
    name: 'DeepSeek',
    brand: { color: '#4D6BFE', letter: 'D' },
    desc: '1:1 还原 chat.deepseek.com，正文藏进「深度思考」',
    shell: {
      url: 'chat.deepseek.com',
      title: 'DeepSeek - 探索未至之境',
      favicon: FAVICON
    },

    mount: function (root, api) {
      var esc = NF.util.escapeHtml;

      /* ============================================================
         骨架
         ============================================================ */
      root.innerHTML =
        '<div class="ds" data-side="' + (api.isSidebarOpen() ? 'open' : 'closed') + '">' +

          '<aside class="ds-side">' +
            '<div class="ds-side-head">' +
              '<div class="ds-logo"><span class="ds-logo-mark">' + WHALE + '</span>' +
                '<span class="ds-logo-text">deepseek</span></div>' +
              '<button class="ds-icon-btn ds-side-collapse" type="button" title="收起侧边栏">' +
                ICON.panel + '</button>' +
            '</div>' +
            '<div class="ds-side-body">' +
              '<button class="ds-newchat" type="button">' + ICON.plus + '<span>新对话</span></button>' +
              '<button class="ds-searchbtn" type="button">' + ICON.search + '<span>搜索</span>' +
                '<span class="ds-search-kbd">⌘ J</span></button>' +
              '<label class="ds-search">' + ICON.search +
                '<input type="text" placeholder="搜索" spellcheck="false">' +
                '<button class="ds-search-clear" type="button" title="清空">&#10005;</button>' +
              '</label>' +
              '<nav class="ds-hist"></nav>' +
            '</div>' +
            '<div class="ds-side-foot">' +
              '<div class="ds-account-menu" hidden>' +
                '<button type="button" data-menu="settings">' + ICON.settings + '<span>设置</span></button>' +
                '<div class="ds-menu-sep"></div>' +
                '<button type="button" data-menu="logout">' + ICON.logout + '<span>退出登录</span></button>' +
              '</div>' +
              '<button class="ds-account" type="button">' +
                '<span class="ds-account-avatar"></span>' +
                '<span class="ds-account-name"></span>' +
                '<span class="ds-account-more">' + ICON.more + '</span>' +
              '</button>' +
            '</div>' +
          '</aside>' +

          '<main class="ds-main">' +
            '<header class="ds-top">' +
              '<button class="ds-icon-btn ds-open-side" type="button" title="展开侧边栏">' +
                ICON.panel + '</button>' +
              '<h1 class="ds-top-title">新的对话</h1>' +
              '<button class="ds-share-btn" type="button" hidden>' + ICON.share + '<span>分享</span></button>' +
            '</header>' +
            '<div class="ds-stage">' +
              '<div class="ds-welcome">' +
                /* 官网 ._5758a85 ._6c7e7df：鲸鱼标记 34×25 与标题同一行，24px/600/32px */
                '<div class="ds-welcome-title">' +
                  '<span class="ds-welcome-mark">' + whale(34) + '</span>' +
                  '<span>Hi，我是 DeepSeek</span>' +
                '</div>' +
                '<div class="ds-welcome-sub">我可以帮你写代码、读文件、写作各种创意内容</div>' +
              '</div>' +
              '<div class="ds-thread" data-role="thread"><div class="ds-thread-inner"></div></div>' +
              '<div class="ds-composer">' +
                '<div class="ds-box">' +
                  '<textarea class="ds-input" rows="2" placeholder="给 DeepSeek 发送消息"></textarea>' +
                  '<div class="ds-box-bar">' +
                    '<span class="ds-tools">' +
                      '<button class="ds-chip" data-cap="think" type="button">' + ICON.spark + '深度思考</button>' +
                      '<button class="ds-chip" data-cap="search" type="button">' + ICON.globe + '智能搜索</button>' +
                    '</span>' +
                    '<span class="ds-tools-right">' +
                      '<button class="ds-attach" type="button" title="上传文件">' + ICON.attach + '</button>' +
                      '<button class="ds-send" type="button" data-ready="0" title="发送">' + ICON.send + '</button>' +
                    '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="ds-disclaimer">内容由 AI 生成，请仔细甄别</div>' +
              '</div>' +
            '</div>' +
          '</main>' +

          /* 分享弹窗：尺寸取官网 .ds-modal-content */
          '<div class="ds-modal" hidden>' +
            '<div class="ds-modal-overlay" data-share="cancel"></div>' +
            '<div class="ds-modal-content" role="dialog" aria-label="分享对话">' +
              '<h3 class="ds-modal-title">分享对话</h3>' +
              '<p class="ds-modal-desc">任何获得链接的人都可以查看这份对话副本。请勿分享包含敏感信息的内容。</p>' +
              '<div class="ds-modal-row">' +
                '<div>' +
                  '<div class="ds-modal-row-label">允许对方继续对话</div>' +
                  '<div class="ds-modal-row-hint">对方可基于这份副本接着提问</div>' +
                '</div>' +
                '<button class="ds-switch" type="button" role="switch" aria-checked="true" data-share="toggle"><i></i></button>' +
              '</div>' +
              '<div class="ds-linkbox" hidden><span></span><button type="button" data-share="copy">复制</button></div>' +
              '<div class="ds-modal-actions">' +
                '<button class="ds-btn ds-btn--ghost" type="button" data-share="cancel">取消</button>' +
                '<button class="ds-btn ds-btn--primary" type="button" data-share="create">创建链接</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<input type="file" class="ds-file" accept=".txt,.md,text/plain" hidden>' +
        '</div>';

      var dsEl = root.querySelector('.ds');
      var histEl = root.querySelector('.ds-hist');
      var searchBtn = root.querySelector('.ds-searchbtn');
      var searchLabel = root.querySelector('.ds-search');
      var searchInput = root.querySelector('.ds-search input');
      var accountMenu = root.querySelector('.ds-account-menu');
      var shareBtn = root.querySelector('.ds-share-btn');
      var modalEl = root.querySelector('.ds-modal');
      var linkBox = root.querySelector('.ds-linkbox');
      /* 弹窗主按钮的稳定引用：它的 data-share 会在 create / copy 之间来回换 */
      var sharePrimary = modalEl.querySelector('.ds-modal-actions .ds-btn--primary');
      var stageEl = root.querySelector('.ds-stage');
      var threadEl = root.querySelector('.ds-thread');
      var innerEl = root.querySelector('.ds-thread-inner');
      var titleEl = root.querySelector('.ds-top-title');
      var inputEl = root.querySelector('.ds-input');
      var sendEl = root.querySelector('.ds-send');
      var chipThink = root.querySelector('.ds-chip[data-cap="think"]');
      var chipSearch = root.querySelector('.ds-chip[data-cap="search"]');
      var fileEl = root.querySelector('.ds-file');

      var feed = null;
      var currentThink = null;
      var headEl = null;          // 最后一条思考块的表头（改文案用）
      var shareOn = true;
      /* 正在流式输出的那一条：{ idx, node, answer, thinkBody, head, stuck } */
      var live = null;

      /* ============================================================
         外观联动：侧栏账户行的头像 / 名字跟着浏览器资料走
         ============================================================ */
      function initialOf(name) { return (String(name || '?').trim().charAt(0)) || '?'; }

      function syncAccount() {
        var b = api.browserProfile();
        var av = root.querySelector('.ds-account-avatar');
        var nm = root.querySelector('.ds-account-name');
        av.innerHTML = b.avatar ? '<img alt="" src="' + esc(b.avatar) + '">' : esc(initialOf(b.name));
        av.style.background = b.avatar ? 'transparent' : (b.avatarColor || '#4d6bfe');
        nm.textContent = b.name;
      }

      /* ============================================================
         渲染
         ============================================================ */
      function renderHistory() {
        histEl.innerHTML = historyHtml(api, searchInput.value);
      }

      function elapsedOf(i) {
        return 8 + ((i * 7 + Math.round(api.progressPercent() * 0.6)) % 23);
      }

      /** 第 i 条助手消息的节点 */
      function msgNode(i) {
        return innerEl.querySelector('.ds-ai-msg[data-idx="' + i + '"]');
      }

      function renderThread() {
        var conv = api.activeConv;
        var list = api.chat.exchanges;
        titleEl.textContent = conv ? conv.title : '新的对话';
        shareBtn.hidden = !list.length;

        innerEl.innerHTML = '';
        feed = null;
        currentThink = null;
        headEl = null;
        live = null;

        if (!list.length) {
          stageEl.classList.add('is-welcome');
          api.mountThinking(null);
          return;
        }
        stageEl.classList.remove('is-welcome');

        var lastIdx = list.length - 1;
        var last = list[lastIdx];
        var html = '';
        list.forEach(function (item, i) {
          html += userNode(item, i);
          html += aiNode(item, i, i === lastIdx, elapsedOf);
        });
        innerEl.innerHTML = html;

        var lastNode = msgNode(lastIdx);
        currentThink = lastNode ? lastNode.querySelector('.ds-think') : null;
        headEl = currentThink ? currentThink.querySelector('.ds-think-label') : null;

        /* 正文只挂在最新一条上，而且只有它是「剧本模式」时才挂：
           最新一条走真实模型时，它的思考框被模型的推理占着，书这时候收起来；
           再发一个触发词，新的剧本消息会把书连同阅读位置一起带回来。 */
        var open = last.thinkOpen !== false;
        if (last.mode !== 'model' && api.chapterCount() > 0) {
          feed = api.mountThinking(currentThink.querySelector('.ds-think-body'), threadEl,
            { noRestore: !open });
        } else {
          api.mountThinking(null);
        }

        applyVotes();
        if (!open) threadEl.scrollTop = threadEl.scrollHeight;
      }

      function applyVotes() {
        var list = api.chat.exchanges;
        Array.prototype.forEach.call(innerEl.querySelectorAll('.ds-ai-msg .ds-msg-actions'), function (box) {
          var i = +box.dataset.idx;
          var v = (list[i] && list[i].vote) || 0;
          var up = box.querySelector('[data-act="up"]');
          var down = box.querySelector('[data-act="down"]');
          if (up) up.classList.toggle('is-on', v === 1);
          if (down) down.classList.toggle('is-on', v === -1);
        });
      }

      function syncChips() {
        chipThink.classList.toggle('is-on', !!api.mask.openThinking);
        chipSearch.classList.toggle('is-on', !!api.mask.webSearch);
      }

      /* ============================================================
         思考块开合
         ============================================================ */
      function setThink(think, open) {
        think.dataset.open = open ? '1' : '0';
        if (think === currentThink && open && feed) feed.ensureMore();
      }

      function collapseAll() {
        Array.prototype.forEach.call(innerEl.querySelectorAll('.ds-think'), function (t) {
          t.dataset.open = '0';
        });
      }

      function openActive() {
        if (currentThink) currentThink.dataset.open = '1';
      }

      /* ============================================================
         操作条
         ============================================================ */
      function copyText(text, label) {
        var done = function () { api.toast(label + '成功'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      }

      function fallbackCopy(text, done) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { api.toast('复制失败'); }
        ta.remove();
      }

      function rawAnswer(i) {
        var list = api.chat.exchanges;
        return list[i] ? list[i].a : '';
      }

      function onAct(act, i) {
        if (act === 'copy') {
          var text = i >= 0 ? rawAnswer(i) : '';
          copyText(text, '复制');
          return;
        }
        if (act === 'regen') { regenerate(i); return; }
        if (act === 'up' || act === 'down') {
          api.vote(i, act === 'up' ? 1 : -1);
          applyVotes();
          return;
        }
      }

      function refreshHead() {
        headEl = currentThink ? currentThink.querySelector('.ds-think-label') : null;
      }

      /* ============================================================
         分享弹窗
         外观与交互一律照官网；只有一处不同，而且是看不见的：
         「深度思考」展开着（也就是小说正摊在屏幕上）时，创建的链接
         会把整本书压缩后编进 fragment —— 这条链接自包含，
         换台机器把它粘回应用就是同一本书。收起状态下就是官网那张空的分享链。
         ============================================================ */
      function novelVisible() {
        var list = api.chat.exchanges;
        var last = list[list.length - 1];
        // 书正摊在屏幕上：最新一条是剧本消息，而且它的思考框是展开的
        return !!last && last.mode !== 'model' && !!feed &&
               !!(currentThink && currentThink.dataset.open === '1') &&
               api.chapterCount() > 0;
      }

      function openShare() {
        modalEl.hidden = false;
        linkBox.hidden = true;
        linkBox.querySelector('span').textContent = '';
        SHARE_LINK = '';
        // 主按钮必须按位置找，不能按 data-share 找：
        // 创建过链接之后它的 data-share 已变成 copy，按值找会扑空。
        sharePrimary.textContent = '创建链接';
        sharePrimary.disabled = false;
        sharePrimary.dataset.share = 'create';
      }

      function closeShare() { modalEl.hidden = true; }

      function createShareLink() {
        if (SHARE_LINK) { copyText(SHARE_LINK, '链接已复制'); return; }

        sharePrimary.disabled = true;      // 压一本书要几十毫秒，挡住连点
        api.share.make(novelVisible()).then(function (res) {
          sharePrimary.disabled = false;
          SHARE_LINK = res.url;
          linkBox.querySelector('span').textContent = SHARE_LINK;
          linkBox.hidden = false;
          sharePrimary.textContent = '复制链接';
          sharePrimary.dataset.share = 'copy';
          copyText(SHARE_LINK, '链接已复制');

          if (res.embedded) {
            api.toast('链接里带着《' + (api.doc.title || '未命名') + '》');
          } else if (res.loadedToFile) {
            api.toast('这本书超出链接长度，已另存为分享副本文件');
          }
        });
      }

      /* ============================================================
         发送 / 流式渲染
         ------------------------------------------------------------
         核心那边决定这一轮走剧本还是走模型，这里只负责把回调里的增量画出来。
         两种模式共用一条渲染路径：思考的增量写进思考体，正文的增量写进回答。
         ============================================================ */

      function nearBottom() {
        return threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
      }

      /** 只在用户本来就贴着底的时候跟着滚，免得打断正在读正文的人 */
      function stick() {
        if (live && live.stuck) threadEl.scrollTop = threadEl.scrollHeight;
      }

      function onThreadScroll() {
        if (!live) return;
        live.stuck = nearBottom();
      }

      function grabLive(index) {
        var node = msgNode(index);
        live = node ? {
          idx: index,
          node: node,
          answer: node.querySelector('.ds-answer'),
          think: node.querySelector('.ds-think'),
          thinkBody: node.querySelector('.ds-think-body'),
          head: node.querySelector('.ds-think-label'),
          stuck: false
        } : null;
        return live;
      }

      function onTurnStart(info) {
        renderThread();                       // 先把新节点建出来
        renderHistory();
        if (!grabLive(info.index)) return;

        /* 要不要跟着滚动：
           模型模式是在跟模型对话，回答在下面长出来，跟到底；
           剧本模式是在看书，「深度思考」里摊着正文，硬跟到底会把人从
           正在读的位置拽走 —— 所以不动，用户自己往下滚一下就恢复跟随。 */
        live.stuck = info.mode === 'model';
        if (live.head) live.head.textContent = '思考中…';
        if (live.think) live.think.classList.add('is-streaming');
        if (info.mode === 'model') threadEl.scrollTop = threadEl.scrollHeight;
      }

      function onTurnThought(elapsed) {
        if (live && live.head) live.head.textContent = '已深度思考（用时 ' + elapsed + ' 秒）';
      }

      function onTurnReasoning(delta, acc) {
        if (!live || !live.thinkBody) return;
        // 只摊开最新一条的思考，历史那些保持收起
        if (live.think && live.think.dataset.open !== '1') live.think.dataset.open = '1';
        live.thinkBody.textContent = acc;
        stick();
      }

      function onTurnContent(delta, acc) {
        if (!live || !live.answer) return;
        live.answer.innerHTML = api.richText(acc);
        stick();
      }

      function onTurnDone(info) {
        if (info.error) api.toast('模型调用失败：' + info.error.message, 8000);

        /* 模型没给推理（多数 chat 类模型都不给）就把整块「深度思考」撤掉。
           真官网在没有思考内容时也不会凭空多出这一行。 */
        if (info.mode === 'model' && !String(info.reasoning || '').trim() && live && live.node) {
          var t = live.node.querySelector('.ds-think');
          if (t) t.remove();
        }
        if (live) {
          if (live.think) live.think.classList.remove('is-streaming');
          if (live.head && info.elapsed) {
            live.head.textContent = '已深度思考（用时 ' + info.elapsed + ' 秒）';
          }
          // 只有模型模式收尾才吸底；剧本模式收尾时用户多半还在读书里
          if (info.mode === 'model') { live.stuck = true; stick(); }
        }
        refreshHead();
        renderHistory();
        live = null;
      }

      /**
       * 发一条消息。text 留空时（直接点发送）核心会从剧本里挑一组，
       * 连提问一起伪装掉 —— 和之前的行为一致。
       */
      function send() {
        var text = inputEl.value.trim();
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendEl.dataset.ready = '0';

        api.runTurn({
          text: text,
          onStart: onTurnStart,
          onThought: onTurnThought,
          onReasoning: onTurnReasoning,
          onContent: onTurnContent,
          onDone: onTurnDone
        });
      }

      /** 「重新生成」：还是走同一条流式路径，看起来才像真的在重新算 */
      function regenerate(i) {
        var item = api.chat.exchanges[i];
        if (!item) return;
        if (item.mode === 'model' && !api.model.ready()) {
          api.toast('还没有配置模型服务，去 设置 → 模型 里加一条');
          return;
        }
        api.runTurn({
          replaceIndex: i,
          text: item.q,
          onStart: onTurnStart,
          onThought: onTurnThought,
          onReasoning: onTurnReasoning,
          onContent: onTurnContent,
          onDone: onTurnDone
        });
      }

      /* ============================================================
         事件
         ============================================================ */
      function onRootClick(e) {
        var t = e.target;

        /* ---- 分享弹窗 ---- */
        if (modalEl && !modalEl.hidden && (t.closest('.ds-modal-content') || t.closest('[data-share="cancel"]'))) {
          var shareAct = t.closest('[data-share]');
          if (shareAct) {
            var kind = shareAct.dataset.share;
            if (kind === 'cancel') { closeShare(); return; }
            if (kind === 'toggle') {
              shareOn = shareAct.getAttribute('aria-checked') !== 'true';
              shareAct.setAttribute('aria-checked', shareOn ? 'true' : 'false');
              return;
            }
            if (kind === 'create' || kind === 'copy') { createShareLink(); return; }
          }
          return;
        }

        /* ---- 侧栏账户菜单 ---- */
        if (t.closest('.ds-account')) {
          accountMenu.hidden = !accountMenu.hidden;
          return;
        }
        var mi = t.closest('[data-menu]');
        if (mi) {
          accountMenu.hidden = true;
          if (mi.dataset.menu === 'settings') NF.bus.emit('open-console');
          else api.toast('已退出登录');
          return;
        }
        if (!t.closest('.ds-account-menu')) accountMenu.hidden = true;

        /* ---- 侧栏 ---- */
        if (t.closest('.ds-newchat')) {
          api.abortTurn();
          api.chat.create();
          renderThread();
          renderHistory();
          inputEl.focus();
          return;
        }
        if (t.closest('.ds-searchbtn')) {
          searchBtn.classList.add('is-hidden');
          searchLabel.classList.add('is-open');
          searchInput.focus();
          return;
        }
        if (t.closest('.ds-search-clear')) {
          searchInput.value = '';
          renderHistory();
          searchLabel.classList.remove('is-open');
          searchBtn.classList.remove('is-hidden');
          return;
        }
        if (t.closest('.ds-side-collapse') || t.closest('.ds-open-side')) {
          api.setSidebar(!api.isSidebarOpen());
          dsEl.dataset.side = api.isSidebarOpen() ? 'open' : 'closed';
          return;
        }
        var hist = t.closest('.ds-hist-item');
        if (hist) {
          api.abortTurn();
          if (api.chat.select(hist.dataset.conv)) {
            renderThread();
            renderHistory();
          }
          return;
        }

        /* ---- 顶栏 ---- */
        if (t.closest('.ds-share-btn')) { openShare(); return; }

        /* ---- 思考块：表头即开关 ---- */
        var head = t.closest('.ds-think-head');
        if (head) {
          var think = head.closest('.ds-think');
          var willOpen = think.dataset.open !== '1';
          setThink(think, willOpen);
          // 被老板键收起后由用户自己点开 → 交回核心，顺带还原阅读位置
          if (willOpen && api.isPanic()) api.resume();
          return;
        }

        /* ---- 能力开关 ---- */
        if (t.closest('.ds-chip[data-cap="think"]')) {
          var on = !api.mask.openThinking;
          api.setOpenThinking(on);
          syncChips();
          if (currentThink) setThink(currentThink, on);
          return;
        }
        if (t.closest('.ds-chip[data-cap="search"]')) {
          api.setWebSearch(!api.mask.webSearch);
          syncChips();
          return;
        }

        /* ---- 输入区 ---- */
        if (t.closest('.ds-send')) { send(); return; }
        if (t.closest('.ds-attach')) { fileEl.click(); return; }
        // 官网：点输入框空白处也会把光标送进 textarea（onMouseDown 里做的同一件事）
        if (t.closest('.ds-box')) { inputEl.focus(); return; }

        /* ---- 消息操作条 ---- */
        var actEl = t.closest('.ds-act');
        if (actEl) {
          var box = actEl.closest('.ds-msg-actions');
          actEl.classList.add('is-hit');
          setTimeout(function () { actEl.classList.remove('is-hit'); }, 380);
          onAct(actEl.dataset.act, box ? +box.dataset.idx : -1);
          return;
        }
      }

      function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }

      function onInput() {
        // 自适应高度：官网文本框最小两行（60px）、最大 336px
        inputEl.style.height = 'auto';
        var h = Math.min(Math.max(inputEl.scrollHeight, 60), 336);
        inputEl.style.height = h + 'px';
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

      /* Esc 关分享弹窗 / 账户菜单（核心也会用 Esc 关外框面板，这边先吃掉） */
      function onDocKeydown(e) {
        if (e.key !== 'Escape') return;
        if (modalEl && !modalEl.hidden) { closeShare(); e.stopPropagation(); e.preventDefault(); return; }
        if (accountMenu && !accountMenu.hidden) { accountMenu.hidden = true; e.stopPropagation(); e.preventDefault(); }
      }

      root.addEventListener('click', onRootClick);
      inputEl.addEventListener('keydown', onKeyDown);
      inputEl.addEventListener('input', onInput);
      searchInput.addEventListener('input', onSearch);
      fileEl.addEventListener('change', onFileChange);
      document.addEventListener('keydown', onDocKeydown, true);
      threadEl.addEventListener('scroll', onThreadScroll, { passive: true });

      /* ============================================================
         订阅
         ============================================================ */
      /**
       * 收起后的落点：把「深度思考」这一行停在视口顶上。
       * 不这么做的话，视野会停在正文底部，而正文一藏、冻结条就跑到屏幕外面去了
       * —— 老板键按下去容易，想点回来得先往上翻半天。
       * 量必须在 collapseAll() 之后：正文还在时表头是 sticky 吸顶的，
       * 那时量到的是「当前滚动位置」，不是它在文档里的真实位置。
       */
      function parkHeadAtTop() {
        var head = currentThink && currentThink.querySelector('.ds-think-head');
        if (!head) return;
        var offset = head.getBoundingClientRect().top -
                     threadEl.getBoundingClientRect().top + threadEl.scrollTop;
        threadEl.scrollTop = Math.max(0, Math.round(offset));
      }

      var offPanic = api.on('panic', function (p) {
        if (p) {
          collapseAll();
          parkHeadAtTop();
        } else {
          openActive();
        }
      });

      /* 表头文案的兜底维护：
         流式期间归流式那边管（那里有真实用时），这里只在「已经落定但还没有
         用时」的历史条目上补一个推出来的秒数。 */
      var offProgress = api.on('progress', function () {
        if (!headEl || live) return;
        var list = api.chat.exchanges;
        var item = list[list.length - 1];
        if (!item || item.mode === 'model' || item.elapsed) return;
        headEl.textContent = '已深度思考（用时 ' + elapsedOf(list.length - 1) + ' 秒）';
      });

      var offMask = api.on('mask', function () {
        syncChips();
        syncAccount();
      });
      var offConv = api.on('conv', function () { renderHistory(); });
      var offProfile = api.on('browser-profile', function () { syncAccount(); });
      var offReload = api.on('thread-reload', function () {
        renderThread();
        renderHistory();
      });
      var offSidebar = api.on('sidebar', function (open) {
        dsEl.dataset.side = open ? 'open' : 'closed';
      });

      /* ============================================================
         挂载
         ============================================================ */
      searchInput.value = api.sidebarQuery();
      syncAccount();
      syncChips();
      renderHistory();
      renderThread();
      if (api.firstRun('novel-hint')) api.toast('小说在「深度思考」里 · Ctrl+D 一键收起');

      CLEANUP = [
        function () {
          api.abortTurn();                       // 别再往已经拆掉的 DOM 里写字
          root.removeEventListener('click', onRootClick);
          inputEl.removeEventListener('keydown', onKeyDown);
          inputEl.removeEventListener('input', onInput);
          searchInput.removeEventListener('input', onSearch);
          fileEl.removeEventListener('change', onFileChange);
          document.removeEventListener('keydown', onDocKeydown, true);
          threadEl.removeEventListener('scroll', onThreadScroll);
          offPanic(); offProgress(); offMask(); offConv(); offReload(); offSidebar();
          offProfile();
        }
      ];
    },

    unmount: function () {
      CLEANUP.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
      CLEANUP = [];
    }
  });
})(window.NovelFish);
