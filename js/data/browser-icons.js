/* ============================================================
   data/browser-icons.js — 浏览器外框用到的图标与菜单文案

   图标用的是 Material Symbols / Chromium 矢量图标的原始路径，
   保证和真实 Chrome、Edge 工具栏上的字形一致（24 网格）。
   菜单结构按 Chrome 桌面版与 Edge 的实际条目排列。

   NF.data.browserIcons.chrome / .edge 是两套图标；
   NF.data.browserMenus 是主菜单与弹出面板的内容。
   ============================================================ */
(function (NF) {
  'use strict';

  /** 把 24 网格的路径包成 svg 字符串 */
  function icon(path, size, fillRule) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) +
      '" aria-hidden="true"><path d="' + path + '" fill="currentColor"' +
      (fillRule ? ' fill-rule="' + fillRule + '"' : '') + '/></svg>';
  }

  /* Material Symbols 原始路径 */
  var P = {
    arrowBack: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    arrowForward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
    refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    /* Chrome 117+ 用「站点信息」滑杆图标取代了原来的绿锁 */
    tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    starOutline: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    starFilled: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    puzzle: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
    moreVert: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    moreHoriz: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z',
    /* Edge 的「集锦」是堆叠的横条 */
    collections: 'M4 5h16v2.2H4V5zm2 5.4h12v2.2H6v-2.2zm3 5.4h6V18H9v-2.2z',
    /* Edge 侧边栏 */
    sidePanel: 'M3 5.5h18v13H3v-13zm2 2v9h3.4v-9H5zm5.4 0v9H19v-9H10.4z',
    /* Edge 的 Copilot / 智能辅助 */
    sparkle: 'M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5zm7 12l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z',
    /* Edge 阅读视图（书本） */
    reading: 'M21 4.5H6.5A2.5 2.5 0 0 0 4 7v12.5h2V7a.5.5 0 0 1 .5-.5H21v-2zm-1.5 3H8a1 1 0 0 0-1 1v10.6c1.3-.8 3-.9 4.4-.2H20V7.5zm-2 3v1.6h-6V10.5h6zm0 3v1.6h-4v-1.6h4z',
    /* 全屏（Material Symbols fullscreen，四角标记） */
    fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
    extensionOff: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5A2.5 2.5 0 0 0 10.5 1 2.5 2.5 0 0 0 8 3.5V5H4.5l15 15h.5c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5zM3.4 2L2 3.4l2.8 2.8c-.5.3-.8.9-.8 1.6v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H4V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7.7 0 1.3.3 1.8.7l5.3 5.3 1.4-1.4L3.4 2z'
  };

  /* ---------------- Chrome ---------------- */
  var chrome = {
    nav: {
      back: icon(P.arrowBack, 20),
      forward: icon(P.arrowForward, 20),
      reload: icon(P.refresh, 20),
      home: icon(P.home, 20)
    },
    omni: {
      site: icon(P.tune, 17),
      lock: icon(P.lock, 15),
      star: icon(P.starOutline, 18),
      starFilled: icon(P.starFilled, 18)
    },
    tools: {
      extensions: icon(P.puzzle, 20),
      more: icon(P.moreVert, 20),
      close: icon(P.close, 14),
      plus: icon(P.plus, 20)
    },
    /* 弹出面板里可共用的行图标 */
    rows: {
      history: icon('M13 3a9 9 0 1 0 8.94 10h-2.02A7 7 0 1 1 13 5v3l4-4-4-4v3zm-2 5v5.4l4.3 2.6.7-1.2-3.5-2.1V8H11z', 18),
      downloads: icon('M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z', 18),
      bookmark: icon(P.starOutline, 18),
      print: icon('M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-1-9H6v4h12V3z', 18),
      cast: icon('M1 18v3h3a3 3 0 0 0-3-3zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7zm0-4v2a9 9 0 0 1 9 9h2A11 11 0 0 0 1 10zm20-7H3a2 2 0 0 0-2 2v3h2V5h18v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z', 18),
      find: icon('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z', 18),
      zoom: icon('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14zM12 7v2H8.5v1H11v2H8.5v1H12v2H7V7h5z', 18),
      full: icon(P.fullscreen, 18),
      tools: icon('M22.7 19l-9.1-9.1a5.5 5.5 0 0 0-7.1-7.1l3.1 3.1-2.8 2.8L3.7 5.6a5.5 5.5 0 0 0 7.1 7.1l9.1 9.1 2.8-2.8z', 18),
      extensions: icon(P.puzzle, 18),
      clear: icon('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z', 18),
      settings: icon('M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.19 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z', 18),
      help: icon('M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92A1.98 1.98 0 0 0 13 14h-2v-.5a2.5 2.5 0 0 1 .73-1.77l1.24-1.26A2 2 0 1 0 9 9H7a4 4 0 1 1 8 0 3.2 3.2 0 0 1-.93 2.25z', 18),
      exit: icon('M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z', 18),
      person: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z', 18),
      sync: icon('M12 4V1L8 5l4 4V6a6 6 0 0 1 5.2 9l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-5.2-9L5.3 7.5A8 8 0 0 0 12 20v3l4-4-4-4v3z', 18),
      check: icon('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z', 18),
      pin: icon('M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7v2h1v5c0 1.1-.9 2-2 2v2h5.97v7l1 1 1-1v-7H19v-2c-1.1 0-2-.9-2-2V4h1V2z', 16),
      folder: icon('M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z', 18),
      incognito: icon('M17.06 13a3 3 0 0 0-2.83 2H9.77a3 3 0 0 0-5.71 0H2v2h2.06A3 3 0 1 0 9.77 17h4.46A3 3 0 1 0 17.06 15H22v-2h-4.94zM6.5 18.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm11 0a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zM19 8.5l-2.4-4.8A2 2 0 0 0 14.8 2.6H9.2a2 2 0 0 0-1.8 1.1L5 8.5h14z', 18),
      window: icon('M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4H4V6h16v2z', 18),
      tab: icon('M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 4h-8V5h8v2z', 18)
    }
  };

  /* ---------------- Edge ---------------- */
  var edge = {
    nav: {
      back: icon(P.arrowBack, 20),
      forward: icon(P.arrowForward, 20),
      reload: icon(P.refresh, 20),
      home: icon(P.home, 20)
    },
    omni: {
      lock: icon(P.lock, 15),
      star: icon(P.starOutline, 18),
      starFilled: icon(P.starFilled, 18),
      copilot: icon(P.sparkle, 18),
      reading: icon(P.reading, 18),
      collections: icon(P.collections, 18)
    },
    tools: {
      extensions: icon(P.puzzle, 20),
      collections: icon(P.collections, 20),
      favorites: icon(P.starOutline, 20),
      more: icon(P.moreHoriz, 20),
      sidebar: icon(P.sidePanel, 20),
      close: icon(P.close, 14),
      plus: icon(P.plus, 20)
    },
    rows: chrome.rows
  };

  /* ---------------- 主菜单（⋮ / ⋯） ----------------
     key: 'fullscreen' 是特殊项，fmtKey 会按系统给出 ⌃⌘F / F11。
     真实 Chrome 把全屏放在系统菜单或 F11 里，这里为了拿得到入口，
     在「缩放」下面提了一级（Edge 的缩放浮层里本来就有这一项）。 */
  var chromeMenu = [
    { icon: 'tab', label: '新建标签页', key: 'mod+T' },
    { icon: 'window', label: '新建窗口', key: 'mod+N' },
    { icon: 'incognito', label: '新建隐身窗口', key: 'mod+shift+N' },
    'sep',
    { icon: 'history', label: '历史记录', sub: true, key: 'mod+Y' },
    { icon: 'downloads', label: '下载内容', sub: true, key: 'mod+shift+J' },
    { icon: 'bookmark', label: '书签和清单', sub: true, key: 'mod+shift+B' },
    'sep',
    { icon: 'person', label: '密码和自动填充', sub: true },
    { icon: 'zoom', label: '缩放', sub: true },
    { icon: 'full', label: '全屏', key: 'fullscreen' },
    { icon: 'cast', label: '投放…' },
    { icon: 'find', label: '查找…', key: 'mod+F' },
    'sep',
    { icon: 'tools', label: '更多工具', sub: true },
    { icon: 'extensions', label: '扩展程序', sub: true },
    { icon: 'clear', label: '删除浏览数据…', key: 'mod+shift+del' },
    'sep',
    { icon: 'settings', label: '设置' },
    { icon: 'help', label: '帮助', sub: true },
    { icon: 'exit', label: '退出', key: 'mod+Q' }
  ];

  var edgeMenu = [
    { icon: 'tab', label: '新建标签页', key: 'mod+T' },
    { icon: 'window', label: '新建窗口', key: 'mod+N' },
    { icon: 'incognito', label: '新建 InPrivate 窗口', key: 'mod+shift+N' },
    'sep',
    { icon: 'zoom', label: '缩放', sub: true },
    { icon: 'full', label: '全屏', key: 'fullscreen' },
    { icon: 'favorites', label: '收藏夹', sub: true, key: 'mod+shift+O' },
    { icon: 'collections', label: '集锦', sub: true, key: 'mod+shift+Y' },
    { icon: 'history', label: '历史记录', sub: true, key: 'mod+H' },
    { icon: 'downloads', label: '下载', sub: true, key: 'mod+J' },
    'sep',
    { icon: 'tools', label: '更多工具', sub: true },
    { icon: 'print', label: '打印', key: 'mod+P' },
    { icon: 'find', label: '在页面上查找', key: 'mod+F' },
    { icon: 'cast', label: '投影到设备' },
    'sep',
    { icon: 'person', label: '个人资料', sub: true },
    { icon: 'extensions', label: '扩展', sub: true },
    { icon: 'settings', label: '设置' },
    { icon: 'help', label: '帮助和反馈', sub: true },
    { icon: 'exit', label: '关闭 Microsoft Edge', key: 'mod+Q' }
  ];

  /* ---------------- 扩展程序面板里列的插件 ---------------- */
  var extensions = [
    { letter: '译', color: '#4B6CF7', name: '沉浸式翻译', desc: '网页对照翻译与 PDF 翻译', pinned: true },
    { letter: '油', color: '#1FBF6B', name: 'Tampermonkey', desc: '浏览器用户脚本管理器', pinned: true },
    { letter: 'u', color: '#8B1A1A', name: 'uBlock Origin', desc: '高效的宽频内容过滤器', pinned: false },
    { letter: 'A', color: '#2E9E5B', name: 'AdGuard 广告拦截器', desc: '拦截各类侵入式广告', pinned: false },
    { letter: '{', color: '#E8A33D', name: 'JSON Viewer', desc: '格式化查看 JSON 响应', pinned: false },
    { letter: '⌘', color: '#5A5F66', name: 'OneTab', desc: '把标签页收进一个列表', pinned: false }
  ];

  NF.data = NF.data || {};
  NF.data.browserIcons = { chrome: chrome, edge: edge };
  NF.data.browserMenus = {
    chrome: chromeMenu,
    edge: edgeMenu,
    extensions: extensions,
    /* 不同浏览器的主菜单按钮 tooltip */
    menuTitle: {
      chrome: '自定义及控制 Google Chrome',
      edge: '设置及其他'
    },
    browserName: { chrome: 'Google Chrome', edge: 'Microsoft Edge' }
  };
})(window.NovelFish);
