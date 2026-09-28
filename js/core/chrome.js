/* ============================================================
   chrome.js — 浏览器外框
   负责把「外层窗口」做得和真实浏览器一致：
     · 按 state.mask.os / state.mask.browser 切换 macOS / Windows、Chrome / Edge
     · 注入官方字形图标（js/data/browser-icons.js）
     · 站点信息、扩展程序、个人资料、主菜单四个弹出面板
     · 地址栏书签星、后退 / 前进 / 刷新等真实行为
   皮肤只占用 .chrome-viewport，外框与皮肤互不依赖。
   ============================================================ */
(function (NF) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* 某些键在 Edge 上对应不同图标（Edge 保留了地址栏的锁） */
  var ICON_ALIAS = {
    chrome: {},
    edge: { 'omni.site': 'omni.lock' }
  };

  var deps = null;     // { state, patch, toast, toggleFullscreen }
  var openPop = null;  // 当前展开的面板元素

  function icons() {
    return NF.data.browserIcons[isEdge() ? 'edge' : 'chrome'];
  }

  function menus() { return NF.data.browserMenus; }
  function isEdge() { return deps.state().mask.browser === 'edge'; }
  function isMac() { return deps.state().mask.os !== 'win'; }

  /** 取当前浏览器图标组里的一组图标，key 形如 'tools.more' */
  function icon(key) {
    var bag = (isEdge() ? NF.data.browserIcons.edge : NF.data.browserIcons.chrome)[key.split('.')[0]];
    return (bag && bag[key.split('.')[1]]) || '';
  }

  /** 带别名解析：'omni.site' 在 Edge 上要换成锁图标 */
  function pick(name) {
    var b = isEdge() ? 'edge' : 'chrome';
    return icon((ICON_ALIAS[b] && ICON_ALIAS[b][name]) || name);
  }

  /** 快捷键文案：macOS 用 ⌘⇧，Windows 用 Ctrl+Shift */
  function fmtKey(spec) {
    var mac = isMac();
    return spec.split('+').map(function (k) {
      if (k === 'mod') return mac ? '\u2318' : 'Ctrl';
      if (k === 'shift') return mac ? '\u21E7' : 'Shift';
      if (k === 'del') return mac ? '\u232B' : 'Del';
      return k;
    }).join(mac ? '' : '+');
  }

  function esc(s) { return NF.util.escapeHtml(s); }

  /* ============================================================
     图标注入
     ============================================================ */
  function applyIcons() {
    Array.prototype.forEach.call(document.querySelectorAll('#chrome [data-icon]'), function (el) {
      el.innerHTML = pick(el.dataset.icon);
    });
    // 主菜单按钮的 tooltip 随浏览器变
    var title = menus().menuTitle[isEdge() ? 'edge' : 'chrome'];
    Array.prototype.forEach.call(document.querySelectorAll('[data-pop="menu"]'), function (el) {
      el.title = title;
    });
  }

  /* ============================================================
     弹出面板
     ============================================================ */

  /** 站点信息（Chrome 的滑杆 / Edge 的锁） */
  function sitePanelHtml() {
    var url = $('omniUrl').textContent || '';
    var secure = isEdge() ? '连接是安全的' : '连接是安全的';
    return '' +
      '<div class="pop-site-head">' +
        '<span class="pop-site-ico">' + (isEdge() ? pick('omni.lock') : pick('omni.site')) + '</span>' +
        '<span class="pop-site-title">' + secure + '</span>' +
      '</div>' +
      '<div class="pop-site-url">' + esc(url) + '</div>' +
      '<div class="pop-sep"></div>' +
      '<button class="pop-item" type="button"><span class="pop-ico">' + pick('rows.bookmark') + '</span>' +
        '<span class="pop-label">Cookie 和网站数据</span><span class="pop-sub">&rsaquo;</span></button>' +
      '<button class="pop-item" type="button"><span class="pop-ico">' + pick('rows.settings') + '</span>' +
        '<span class="pop-label">网站设置</span><span class="pop-sub">&rsaquo;</span></button>';
  }

  /** 扩展程序清单 */
  function extPanelHtml() {
    var list = menus().extensions;
    var title = isEdge() ? '扩展' : '扩展程序';
    var manage = isEdge() ? '管理扩展' : '管理扩展程序';
    return '' +
      '<div class="pop-head">' +
        '<span class="pop-head-title">' + title + '</span>' +
        '<button class="pop-link" type="button">' + manage + '</button>' +
      '</div>' +
      '<div class="pop-ext-list">' +
        list.map(function (x) {
          return '<div class="pop-ext-row">' +
            '<span class="pop-ext-ico" style="background:' + x.color + '">' + esc(x.letter) + '</span>' +
            '<span class="pop-ext-meta">' +
              '<span class="pop-ext-name">' + esc(x.name) + '</span>' +
              '<span class="pop-ext-desc">' + esc(x.desc) + '</span>' +
            '</span>' +
            '<button class="pop-ext-act' + (x.pinned ? ' is-on' : '') + '" type="button" title="' +
              (x.pinned ? '取消固定' : '固定到工具栏') + '">' + pick('rows.pin') + '</button>' +
            '<button class="pop-ext-act" type="button" title="更多操作">' + icon('tools.more') + '</button>' +
            '</div>';
        }).join('') +
      '</div>' +
      '<div class="pop-sep"></div>' +
      '<button class="pop-item" type="button"><span class="pop-ico">' + pick('rows.extensions') + '</span>' +
        '<span class="pop-label">' + manage + '</span><span class="pop-sub">&rsaquo;</span></button>';
  }

  /** 个人资料 */
  function avatarPanelHtml() {
    var p = deps.state().browser;
    var initial = (p.name || '?').trim().charAt(0) || '?';
    var edge = isEdge();
    return '' +
      '<div class="pop-profile">' +
        '<span class="pop-profile-avatar">' + esc(initial) + '</span>' +
        '<span class="pop-profile-meta">' +
          '<span class="pop-profile-name">' + esc(p.name) + '</span>' +
          '<span class="pop-profile-mail">' + esc(p.email) + '</span>' +
          '<span class="pop-profile-sync">' + pick('rows.check') + ' ' +
            (edge ? '已同步到此设备' : '同步功能已开启') + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="pop-profile-btns">' +
        '<button class="pop-btn" type="button">' + (edge ? '管理个人资料' : '自定义个人资料') + '</button>' +
        '<button class="pop-btn" type="button">添加个人资料</button>' +
      '</div>' +
      '<div class="pop-sep"></div>' +
      '<button class="pop-item" type="button"><span class="pop-ico">' + pick('rows.person') + '</span>' +
        '<span class="pop-label">' + (edge ? '管理 Microsoft 账户' : '管理您的 Google 账号') + '</span></button>' +
      '<button class="pop-item" type="button"><span class="pop-ico">' + pick('rows.exit') + '</span>' +
        '<span class="pop-label">' + (edge ? '退出登录' : '退出') + '</span></button>';
  }

  /** 主菜单 */
  function menuPanelHtml() {
    var items = menus()[isEdge() ? 'edge' : 'chrome'];
    var R = NF.data.browserIcons[isEdge() ? 'edge' : 'chrome'].rows;
    return items.map(function (it) {
      if (it === 'sep') return '<div class="pop-sep"></div>';
      return '<button class="pop-item" type="button" data-menuitem="' + esc(it.label) + '">' +
        '<span class="pop-ico">' + (R[it.icon] || '') + '</span>' +
        '<span class="pop-label">' + esc(it.label) + '</span>' +
        (it.key ? '<span class="pop-key">' + fmtKey(it.key) + '</span>'
                : (it.sub ? '<span class="pop-sub">&rsaquo;</span>' : '')) +
        '</button>';
    }).join('');
  }

  var PANELS = {
    site: { el: 'popSite', build: sitePanelHtml },
    ext: { el: 'popExt', build: extPanelHtml },
    avatar: { el: 'popAvatar', build: avatarPanelHtml },
    menu: { el: 'popMenu', build: menuPanelHtml }
  };

  function closePopovers() {
    var had = !!openPop;
    Object.keys(PANELS).forEach(function (k) { $(PANELS[k].el).hidden = true; });
    openPop = null;
    Array.prototype.forEach.call(document.querySelectorAll('.chrome-toolbar .is-pressed'), function (el) {
      el.classList.remove('is-pressed');
    });
    return had;
  }

  function openPopover(name, anchor) {
    var cfg = PANELS[name];
    if (!cfg) return;
    var el = $(cfg.el);
    var wasOpen = !el.hidden && openPop === el;
    closePopovers();
    if (wasOpen) return;
    el.innerHTML = cfg.build();
    el.hidden = false;
    openPop = el;
    if (anchor) anchor.classList.add('is-pressed');
    el.dataset.anchor = name;
  }

  function popoverOf(node) {
    for (var k in PANELS) if ($(PANELS[k].el) === node) return k;
    return null;
  }

  /* ============================================================
     事件
     ============================================================ */
  function onToolbarClick(e) {
    // 面板内部的点击
    var insidePop = e.target.closest('.chrome-pop');
    if (insidePop) {
      var pin = e.target.closest('.pop-ext-act');
      if (pin && pin.getAttribute('title') !== '更多操作') {
        pin.classList.toggle('is-on');
        pin.title = pin.classList.contains('is-on') ? '取消固定' : '固定到工具栏';
        return;
      }
      var mi = e.target.closest('[data-menuitem]');
      if (mi) {
        var label = mi.dataset.menuitem;
        closePopovers();
        // 「设置」直接映射到本应用的控制台，点进去不会露馅
        if (label === '设置' || label === 'Preferences') {
          NF.bus.emit('open-console');
        }
        return;
      }
      if (e.target.closest('.pop-item') || e.target.closest('.pop-btn') || e.target.closest('.pop-link')) {
        closePopovers();
        return;
      }
      return;   // 面板内部的空白点击不关闭
    }

    // 地址栏书签星：切换填充态
    var star = e.target.closest('.omni-star');
    if (star) {
      var filled = star.dataset.on === '1';
      star.dataset.on = filled ? '0' : '1';
      star.innerHTML = pick(filled ? 'omni.star' : 'omni.starFilled');
      star.title = filled ? '为此标签页添加书签' : '修改书签';
      closePopovers();
      return;
    }

    // 导航按钮：行为是真的
    var nav = e.target.closest('[data-nav]');
    if (nav) {
      var kind = nav.dataset.nav;
      if (kind === 'reload') location.reload();
      else if (kind === 'back') history.back();
      else if (kind === 'forward') history.forward();
      closePopovers();
      return;
    }

    // Edge 的侧边栏按钮映射到本应用的对话列表抽屉
    if (e.target.closest('[data-edge="sidebar"]')) {
      var open = !deps.state().sidebar.open;
      deps.patch({ sidebar: { open: open } });
      NF.bus.emit('sidebar', open);
      closePopovers();
      return;
    }

    // 弹出面板开关
    var trigger = e.target.closest('[data-pop]');
    if (trigger) {
      var name = trigger.dataset.pop;
      if (PANELS[name]) {
        openPopover(name, trigger);
      } else {
        // 集锦 / 收藏夹 / Copilot 这类只给按压反馈
        trigger.classList.toggle('is-pressed');
        closePopovers();
        trigger.classList.add('is-pressed');
      }
      return;
    }

    closePopovers();
  }

  function init(d) {
    deps = d;
    var toolbar = $('toolbar');
    toolbar.addEventListener('click', onToolbarClick);

    // 点外框空白处关面板
    document.addEventListener('mousedown', function (e) {
      if (!openPop) return;
      if (e.target.closest('.chrome-pop') || e.target.closest('[data-pop]')) return;
      closePopovers();
    });

    apply();
  }

  /* ============================================================
     应用状态
     ============================================================ */
  function apply() {
    if (!deps) return;              // init 之前被调用就直接跳过
    var s = deps.state();
    var app = $('app');
    app.dataset.browser = s.mask.browser === 'edge' ? 'edge' : 'chrome';
    applyIcons();
    applyProfile();
    if (openPop) closePopovers();   // 切换浏览器 / 系统后旧面板内容作废
  }

  function applyProfile() {
    if (!deps) return;
    var p = deps.state().browser;
    var initial = (p.name || '?').trim().charAt(0) || '?';
    Array.prototype.forEach.call(document.querySelectorAll('.chrome-avatar'), function (el) {
      el.textContent = initial;
      el.title = (isEdge() ? '个人资料：' : 'Google 账号：') + p.name;
    });
  }

  NF.chromeFrame = {
    init: init,
    apply: apply,
    applyProfile: applyProfile,
    closePopovers: closePopovers,
    /** 供核心判断 Esc 是否被面板吃掉 */
    anyOpen: function () { return !!openPop; },
    /** 测试与调试用 */
    _popoverOf: popoverOf
  };
})(window.NovelFish);
