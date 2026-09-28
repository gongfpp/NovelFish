/* ============================================================
   app.js — 主控制器
   职责：状态装配 → 皮肤挂载 → 控制台 → 快捷键 → 老板键 → 换书
   ============================================================ */
(function (NF) {
  'use strict';

  var U = NF.util;
  var $ = function (id) { return document.getElementById(id); };

  var state = NF.store.load();   // 先读本地状态，再装配控制器

  var activeSkin = null;
  var activeShell = {};        // 当前皮肤的 shell（地址栏 / 标签页 / 图标）
  var feeds = [];
  var activeFeed = null;

  var panic = false;          // 老板键态
  var panicByBlur = false;
  var autoRAF = null;
  var autoPaused = false;
  var lastAutoTs = 0;

  /* ============================================================
     供皮肤使用的统一能力层
     ============================================================ */
  var api = {
    get doc() { return NF.novel.doc; },
    get reading() { return state.reading; },
    get mask() { return state.mask; },

    escape: U.escapeHtml,
    richText: U.richText,
    toast: NF.toast,

    /* --- 伪装内容 --- */
    pickCamouflage: function () { return NF.camouflage.pick(state.mask.script); },
    historyTitles: function (n) { return NF.camouflage.historyTitles(n || 8); },

    /* --- 小说 --- */
    toc: NF.novel.toc,
    chapterCount: NF.novel.chapterCount,
    chapterTitle: NF.novel.chapterTitle,
    progressPercent: function () {
      var n = NF.novel.chapterCount() || 1;
      var c = api.currentChapter();
      return U.clamp(Math.round((c + 1) / n * 100), 0, 100);
    },
    currentChapter: function () {
      if (activeFeed && activeFeed.readingChapter) return activeFeed.readingChapter();
      return state.progress.chapter || 0;
    },

    /* --- 会话 --- */
    chat: NF.chat,
    get convs() { return NF.chat.groups(state.sidebar.query); },
    get activeConv() { return NF.chat.active(); },
    selectConv: function (id) { return NF.chat.select(id); },
    newConv: function () { return NF.chat.create(); },
    /** 当前会话的伪装问答（皮肤直接渲染） */
    get exchanges() { return NF.chat.exchanges; },
    /**
     * 取一组伪装问答并写入当前会话。
     * @param {{ q?: string }} opts 传 q 时用调用方给的提问（用户在输入框里打的字）
     */
    makeExchange: function (opts) {
      var item = NF.camouflage.pick(state.mask.script);
      if (opts && opts.q) item = { q: opts.q, a: item.a, topic: item.topic };
      NF.chat.append(item);
      return item;
    },
    /** 把某条模板问答插到当前对话末尾（控制台的「对话模板」用） */
    insertTemplate: function (scriptId, pairIndex) {
      var p = NF.camouflage.pair(scriptId, pairIndex);
      if (!p) return false;
      NF.chat.append({ q: p.q, a: p.a });
      NF.bus.emit('thread-reload');
      return true;
    },

    /* --- 侧边栏 / 外框 --- */
    sidebarQuery: function () { return state.sidebar.query || ''; },
    setSidebarQuery: function (v) { NF.store.patch({ sidebar: { query: String(v || '') } }); },
    isSidebarOpen: function () { return !!state.sidebar.open; },
    setSidebar: function (v) { NF.store.patch({ sidebar: { open: !!v } }); },
    setWebSearch: function (v) { NF.store.patch({ mask: { webSearch: !!v } }); },
    setOpenThinking: function (v) { NF.store.patch({ mask: { openThinking: !!v } }); },
    setOs: function (os) {
      NF.store.patch({ mask: { os: os === 'win' ? 'win' : 'mac' } });
      applyShell(); syncLookUI();
    },
    setBrowser: function (b) {
      NF.store.patch({ mask: { browser: b === 'edge' ? 'edge' : 'chrome' } });
      applyShell(); syncLookUI();
    },

    /* --- 浏览器资料 / 标签页 --- */
    browserProfile: function () { return state.browser; },
    setBrowserProfile: function (key, value) {
      if (!(key in state.browser)) return;
      state.browser[key] = value;
      NF.store.save();
      if (NF.chromeFrame) NF.chromeFrame.applyProfile();
      if (key === 'tabTitle') refreshTabTitle();
      NF.bus.emit('browser-profile', state.browser);
    },

    /* --- 浏览器缩放 / 页内查找 --- */
    zoom: function () { return Number(state.ui.zoom) || 1; },
    setZoom: function (z) { return setZoom(z); },
    openFind: function () { NF.bus.emit('find'); },

    /* --- 消息操作条 --- */
    rollAnswer: function (i) { return NF.chat.rollAnswer(i); },
    vote: function (i, v) { return NF.chat.vote(i, v); },

    /* --- 控制台 --- */
    openConsole: function (v, pane) { openConsole(v, pane); },
    toggleFullscreen: function () { toggleFullscreen(); },

    /**
     * 一次性提示：同一个 key 只在第一次返回 true（标记落盘）。
     * 皮肤用它做首启引导，避免每次打开都弹「小说在深度思考里」这类露出破绽的提示。
     */
    firstRun: function (key) {
      state.seen = state.seen || {};
      if (state.seen[key]) return false;
      state.seen[key] = true;
      NF.store.save();
      return true;
    },

    isPanic: function () { return panic; },

    /** 把小说挂进「深度思考」容器；返回 feed 控制器 */
    mountThinking: function (bodyEl, scroller, opts) {
      feeds.forEach(function (f) { try { f.destroy(); } catch (e) { /* noop */ } });
      feeds = [];
      var feed = NF.feed.create(bodyEl, scroller, opts || {});
      feeds.push(feed);
      activeFeed = feed;
      applyReadingVars();
      return feed;
    },
    registerFeed: function (feed) { feeds.push(feed); activeFeed = feed; },

    gotoChapter: function (i) {
      if (!activeFeed) return;
      activeFeed.gotoChapter(i, true);
      autoPaused = false;
      syncConsoleProgress();
      return i;
    },
    nextChapter: function () { return activeFeed ? activeFeed.next() : 0; },
    prevChapter: function () { return activeFeed ? activeFeed.prev() : 0; },

    /** 皮肤里的「上传文件」直接当换书入口用 */
    loadNovelFile: function (file) { handleFiles([file]); },

    on: function (evt, fn) { return NF.bus.on(evt, fn); },
    emit: function (evt, p) { NF.bus.emit(evt, p); }
  };

  NF.api = api;

  /* ============================================================
     阅读参数 / 外框外观 → DOM
     ============================================================ */
  function applyReadingVars() {
    var r = state.reading;
    var root = document.documentElement.style;
    root.setProperty('--nf-font', r.font + 'px');
    root.setProperty('--nf-line', String(r.line));
    root.setProperty('--nf-width', r.width + 'px');
  }

  function applyShell() {
    var app = $('app');
    app.dataset.shell = state.mask.chrome ? 'chrome' : 'bare';
    app.dataset.os = state.mask.os === 'win' ? 'win' : 'mac';
    app.dataset.browser = state.mask.browser === 'edge' ? 'edge' : 'chrome';
    applyZoom();
    if (NF.chromeFrame) NF.chromeFrame.apply();
  }

  /** 浏览器缩放：作用于视口，和真 Chrome 的 Ctrl+/- 一致 */
  function applyZoom() {
    var vp = $('skinRoot');
    if (!vp) return;
    var z = Number(state.ui && state.ui.zoom) || 1;
    vp.style.zoom = z === 1 ? '' : String(z);
  }

  function setZoom(z) {
    var next = U.clamp(Math.round(z * 10) / 10, 0.5, 2);
    NF.store.patch({ ui: { zoom: next } });
    applyZoom();
    return next;
  }

  /* ============================================================
     小说装载
     ============================================================ */
  function resetProgress() {
    state.progress.chapter = 0;
    state.progress.loadedThrough = 0;
    state.progress.scrollTop = 0;
    state.progress.feedOffset = null;
    NF.chat.reset();                 // 换书时重排伪装会话
    NF.store.save();
  }

  function setNovel(text, title, opts) {
    opts = opts || {};
    NF.novel.parse(text, title);
    state.novel.title = title;
    state.novel.text = text.length > 1.6 * 1024 * 1024 ? '' : text;
    state.novel.docId = String(Date.now());
    resetProgress();
    buildChapterList();
    syncBookMeta();
    mountSkin(state.skin, { remount: true });
    if (!opts.silent) {
      NF.toast('已载入《' + title + '》共 ' + NF.novel.chapterCount() + ' 章');
    }
  }

  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.onload = function () {
        var buf = fr.result;
        var text;
        try {
          // 优先严格 UTF-8；失败再按 GBK 解（中文 txt 常见）
          text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        } catch (e) {
          try { text = new TextDecoder('gbk').decode(buf); }
          catch (e2) { text = new TextDecoder('utf-8').decode(buf); }
        }
        resolve(text);
      };
      fr.readAsArrayBuffer(file);
    });
  }

  function handleFiles(fileList) {
    var file = fileList && fileList[0];
    if (!file) return;
    if (!/\.(txt|md|text)$/i.test(file.name) && file.type.indexOf('text') !== 0) {
      NF.toast('只支持 .txt / .md 文本文件');
      return;
    }
    readTextFile(file).then(function (text) {
      var title = file.name.replace(/\.[^.]+$/, '');
      setNovel(text, title);
    }).catch(function (err) { NF.toast(err.message); });
  }

  /* ============================================================
     皮肤装载
     ============================================================ */
  /**
   * 皮肤给的 favicon 有两种写法：内联 <svg> 标记，或已经是 data URI。
   * 统一成 data URI，才能同时喂给 <img> 和真实浏览器标签页的 <link rel="icon">。
   */
  function faviconUri(fav) {
    if (!fav) return '';
    if (/^data:/i.test(fav)) return fav;
    return 'data:image/svg+xml,' + encodeURIComponent(String(fav).trim());
  }

  function applyShellMeta(shell) {
    activeShell = shell || {};
    var url = activeShell.url || 'chat.deepseek.com';
    // 标签页标题：用户自定义优先，留空则跟随皮肤
    var custom = (state.browser && state.browser.tabTitle || '').trim();
    var title = custom || activeShell.title || '新标签页';
    $('omniUrl').textContent = url;
    $('tabTitle').textContent = title;
    document.title = title;

    var uri = faviconUri(activeShell.favicon);
    $('tabFavicon').innerHTML = uri ? '<img alt="" src="' + uri + '">' : '';
    // 真实浏览器标签页上的图标也跟着皮肤走
    var pageFav = $('pageFavicon');
    if (pageFav) pageFav.href = uri || 'data:,';

    if (typeof syncFaviconPreview === 'function') syncFaviconPreview();
  }

  /** 只刷新标签页标题 / 图标，不重挂皮肤 */
  function refreshTabTitle() {
    applyShellMeta(activeShell);
  }

  function mountSkin(id, opts) {
    opts = opts || {};
    var root = $('skinRoot');

    return NF.skins.load(id).then(function (def) {
      // 卸载旧皮肤
      if (activeSkin && activeSkin.unmount) {
        try { activeSkin.unmount(); } catch (e) { /* noop */ }
      }
      feeds.forEach(function (f) { try { f.destroy(); } catch (e) { /* noop */ } });
      feeds = [];
      activeFeed = null;

      root.innerHTML = '';
      activeSkin = def;
      state.skin = id;
      NF.store.save();
      applyShellMeta(def.shell);

      panic = false;
      panicByBlur = false;

      def.mount(root, api);
      applyReadingVars();
      if (state.reading.auto) startAuto(true);

      syncSkinGrid();
      if (!opts.silent && !opts.remount) NF.toast('已切换到「' + def.name + '」');
    }).catch(function (err) {
      console.error(err);
      NF.toast('皮肤加载失败：' + err.message);
    });
  }

  /* ============================================================
     老板键
     ============================================================ */
  function setPanic(v, opts) {
    opts = opts || {};
    if (panic === v) return;
    panic = v;
    if (opts.byBlur) panicByBlur = v;
    stopAuto();
    NF.bus.emit('panic', panic);
    if (!activeFeed) return;

    var el = activeFeed.scrollEl;
    if (panic) {
      // 收起：记住阅读位置，再把视野推到伪装回答上（进度不受影响）
      activeFeed.savePos();
      activeFeed.setQuiet(true);
      el.scrollTop = el.scrollHeight;
    } else {
      // 恢复：回到收起前的位置
      activeFeed.setQuiet(false);
      activeFeed.restorePos();
      if (state.reading.auto) startAuto(true);
    }
  }

  /* ============================================================
     自动滚动
     ============================================================ */
  function startAuto(reset) {
    stopAuto();
    if (!activeFeed) return;
    autoPaused = false;
    lastAutoTs = 0;
    var step = function (ts) {
      if (!state.reading.auto || panic) { autoRAF = null; return; }
      if (!lastAutoTs) lastAutoTs = ts;
      var dt = Math.min(64, ts - lastAutoTs);
      lastAutoTs = ts;

      if (!autoPaused && activeFeed) {
        var el = activeFeed.scrollEl;
        var max = el.scrollHeight - el.clientHeight;
        if (el.scrollTop >= max - 4) {
          activeFeed.appendNext();
        } else {
          el.scrollTop = el.scrollTop + (46 * state.reading.speed) * dt / 1000;
        }
      }
      autoRAF = requestAnimationFrame(step);
    };
    if (reset) autoRAF = requestAnimationFrame(step);
  }

  function stopAuto() {
    if (autoRAF) { cancelAnimationFrame(autoRAF); autoRAF = null; }
  }

  function bindAutoPause() {
    var pause = function () { autoPaused = true; };
    window.addEventListener('wheel', pause, { passive: true });
    window.addEventListener('touchstart', pause, { passive: true });
    window.addEventListener('mousedown', pause, { passive: true });
  }

  /* ============================================================
     控制台
     ============================================================ */
  function openConsole(v, pane) {
    var open = typeof v === 'boolean' ? v : $('console').hidden;
    $('console').hidden = !open;
    $('scrim').hidden = !open;
    if (open) {
      if (pane) showPane(pane);
      syncConsoleProgress();
      syncMaskUI();
    }
  }

  /** 切到控制台的某一页（书架 / 阅读 / 皮肤 / 伪装 / 外观 / 帮助） */
  function showPane(name) {
    Array.prototype.forEach.call($('consoleTabs').children, function (b) {
      b.classList.toggle('is-active', b.dataset.tab === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.cpane'), function (p) {
      p.classList.toggle('is-active', p.dataset.pane === name);
    });
  }

  function syncBookMeta() {
    $('bookTitle').textContent = '《' + (NF.novel.doc.title || '未命名') + '》';
    $('bookSub').textContent = NF.novel.chapterCount() + ' 章 · 约 ' +
      U.fmt(NF.novel.totalChars()) + ' 字';
    $('chCount').textContent = NF.novel.chapterCount() + ' 章';
  }

  function buildChapterList() {
    var box = $('chapterList');
    box.innerHTML = NF.novel.toc().map(function (c) {
      return '<div class="chapter-item" data-i="' + c.index + '">' +
        '<span class="ci-idx">' + (c.index + 1) + '</span>' +
        '<span class="ci-title">' + U.escapeHtml(c.title) + '</span>' +
        '</div>';
    }).join('');
  }

  function syncConsoleProgress() {
    var n = NF.novel.chapterCount() || 1;
    var cur = api.currentChapter();
    var pct = api.progressPercent();
    $('progBar').style.width = pct + '%';
    $('progHint').textContent = '第 ' + (cur + 1) + ' / ' + n + ' 章 · ' + pct + '%';
    Array.prototype.forEach.call($('chapterList').children, function (el) {
      el.classList.toggle('is-active', +el.dataset.i === cur);
    });
  }

  function buildSkinGrid() {
    $('skinGrid').innerHTML = NF.skins.list().map(function (s) {
      var live = s.status === 'live';
      return '<div class="skin-card' + (s.id === state.skin ? ' is-active' : '') +
        (live ? '' : ' is-locked') + '" data-skin="' + s.id + '">' +
        '<span class="skin-badge" style="background:' + s.brand.color + '">' + s.brand.letter + '</span>' +
        '<span class="skin-info">' +
        '<span class="skin-name">' + U.escapeHtml(s.name) +
        '<span class="skin-tag' + (live ? ' is-live' : '') + '">' + (live ? '可用' : '规划中') + '</span>' +
        '</span>' +
        '<span class="skin-desc">' + U.escapeHtml(s.desc) + '</span>' +
        '</span>' +
        '<span class="skin-radio"></span>' +
        '</div>';
    }).join('');
  }

  function syncSkinGrid() {
    Array.prototype.forEach.call($('skinGrid').children, function (el) {
      el.classList.toggle('is-active', el.dataset.skin === state.skin);
    });
  }

  function buildScriptSelect() {
    var opts = ['<option value="auto">混合（轮流使用全部剧本）</option>'];
    NF.camouflage.scripts.forEach(function (s) {
      opts.push('<option value="' + s.id + '">' + U.escapeHtml(s.name) +
        '（' + s.count + ' 组）</option>');
    });
    $('selScript').innerHTML = opts.join('');
    $('selScript').value = state.mask.script;
    $('tplCount').textContent = NF.camouflage.scripts.length + ' 类 · ' +
      NF.camouflage.total + ' 组';
  }

  /** 对话模板清单：点一条就插到当前对话里 */
  function buildTplList() {
    $('tplList').innerHTML = NF.camouflage.raw.map(function (s) {
      var head = '<div class="tpl-group-head">' + U.escapeHtml(s.name) +
        ' · ' + s.pairs.length + ' 组</div>';
      var items = s.pairs.map(function (p, i) {
        return '<div class="tpl-item" data-script="' + s.id + '" data-pair="' + i + '">' +
          '<span class="tpl-idx">' + (i + 1) + '</span>' +
          '<span class="tpl-q">' + U.escapeHtml(p.q) + '</span>' +
          '</div>';
      }).join('');
      return head + items;
    }).join('');
  }

  /** 快捷键表随外框平台变化（⌘ / Ctrl） */
  function buildHelp() {
    var mac = state.mask.os !== 'win';
    var mod = mac ? '&#8984;' : 'Ctrl';
    var k = function (s) { return '<kbd>' + s + '</kbd>'; };
    var rows = [
      [k('Esc'), '老板键：收起 / 展开「深度思考」，视野回到伪装回答'],
      [k(mod) + ' + ' + k('B'), '打开 / 收起左侧的聊天记录与对话列表'],
      [k('空格') + ' / ' + k('J'), '向下翻一屏'],
      [k('Shift') + ' + ' + k('空格') + ' / ' + k('K'), '向上翻一屏'],
      [k('&larr;') + ' / ' + k('&rarr;'), '上一章 / 下一章'],
      [k('A'), '自动滚动开关'],
      [k('+') + ' / ' + k('-'), '字号增减'],
      [k(mod) + ' + ' + k(','), '打开控制台（伪装成设置面板）'],
      [k(mod) + ' + ' + k('F'), '页内查找'],
      [k(mod) + ' + ' + k('+') + ' / ' + k('-') + ' / ' + k('0'), '浏览器缩放'],
      [k(mod) + ' + ' + k('T'), '新标签页'],
      [k('T'), '隐藏 / 显示浏览器外框'],
      [k('F'), '真全屏（Windows 外框的「最大化」按钮同效）']
    ];
    $('helpKeys').innerHTML = rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('');
  }

  /** 控制台里的开关 / 分段控件与真实状态对齐 */
  function syncMaskUI() {
    $('swBlur').setAttribute('aria-checked', String(!!state.mask.blurCollapse));
    $('swOpen').setAttribute('aria-checked', String(!!state.mask.openThinking));
    $('swChrome').setAttribute('aria-checked', String(!!state.mask.chrome));
    syncLookUI();
  }

  function syncLookUI() {
    Array.prototype.forEach.call($('segOs').children, function (b) {
      b.classList.toggle('is-active', b.dataset.os === (state.mask.os === 'win' ? 'win' : 'mac'));
    });
    Array.prototype.forEach.call($('segBrowser').children, function (b) {
      b.classList.toggle('is-active',
        b.dataset.browser === (state.mask.browser === 'edge' ? 'edge' : 'chrome'));
    });
    $('inpProfileName').value = state.browser.name;
    $('inpProfileEmail').value = state.browser.email;
    $('inpTabTitle').value = state.browser.tabTitle || '';
    $('inpAvatarColor').value = state.browser.avatarColor || '#4d6bfe';
    syncAvatarPreview();
    syncFaviconPreview();
  }

  function syncAvatarPreview() {
    var el = $('avatarPreview');
    if (!el) return;
    var b = state.browser;
    if (b.avatar) {
      el.style.background = 'transparent';
      el.innerHTML = '<img alt="" src="' + NF.util.escapeHtml(b.avatar) + '">';
    } else {
      el.style.background = b.avatarColor || '#4d6bfe';
      el.textContent = (String(b.name || '?').trim().charAt(0)) || '?';
    }
  }

  function syncFaviconPreview() {
    var el = $('faviconPreview');
    if (!el) return;
    var uri = faviconUri(activeShell.favicon);
    el.innerHTML = uri ? '<img alt="" src="' + uri + '">' : '';
  }

  function bindConsole() {
    // 标签页
    $('consoleTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.ctab');
      if (!btn) return;
      showPane(btn.dataset.tab);
    });

    $('consoleClose').addEventListener('click', function () { openConsole(false); });
    $('scrim').addEventListener('click', function () { openConsole(false); });

    // 载入小说
    var dz = $('dropzone');
    dz.addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function () {
      handleFiles(this.files);
      this.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dz.addEventListener(evt, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dz.addEventListener(evt, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
    });
    dz.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });

    $('btnRestoreSample').addEventListener('click', function () {
      var s = NF.data.sampleNovel;
      setNovel(s.text, s.title);
    });

    $('btnPrevCh').addEventListener('click', function () { api.prevChapter(); syncConsoleProgress(); });
    $('btnNextCh').addEventListener('click', function () { api.nextChapter(); syncConsoleProgress(); });

    $('chapterList').addEventListener('click', function (e) {
      var item = e.target.closest('.chapter-item');
      if (!item) return;
      api.gotoChapter(+item.dataset.i);
      openConsole(false);
      NF.toast('已跳到：' + NF.novel.chapterTitle(+item.dataset.i));
    });

    // 阅读参数
    function bindRange(id, key, fmt) {
      var el = $(id);
      el.value = state.reading[key];
      var hint = $('v' + id.slice(1));
      if (hint) hint.textContent = fmt(state.reading[key]);
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        var patch = { reading: {} };
        patch.reading[key] = v;
        NF.store.patch(patch);
        if (hint) hint.textContent = fmt(v);
        applyReadingVars();
      });
    }
    bindRange('rFont', 'font', function (v) { return v + ' px'; });
    bindRange('rLine', 'line', function (v) { return v.toFixed(1); });
    bindRange('rWidth', 'width', function (v) { return v + ' px'; });
    bindRange('rSpeed', 'speed', function (v) { return v.toFixed(1) + ' x'; });

    // 开关
    function bindSwitch(id, key, ns, onToggle) {
      var el = $(id);
      el.setAttribute('aria-checked', String(!!state[ns][key]));
      el.addEventListener('click', function () {
        var v = !(state[ns][key]);
        var patch = {}; patch[ns] = {};
        patch[ns][key] = v;
        NF.store.patch(patch);
        el.setAttribute('aria-checked', String(v));
        if (onToggle) onToggle(v);
      });
    }
    bindSwitch('swAuto', 'auto', 'reading', function (v) {
      if (v) { startAuto(true); NF.toast('自动滚动已开启'); }
      else { stopAuto(); NF.toast('自动滚动已暂停'); }
    });
    bindSwitch('swBlur', 'blurCollapse', 'mask');
    bindSwitch('swOpen', 'openThinking', 'mask', function () {
      mountSkin(state.skin, { remount: true, silent: true });
    });
    bindSwitch('swChrome', 'chrome', 'mask', applyShell);

    // 外框系统 / 浏览器
    $('segOs').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-item');
      if (!btn) return;
      api.setOs(btn.dataset.os);
      NF.toast(btn.dataset.os === 'win' ? '外框已切换为 Windows' : '外框已切换为 macOS');
    });
    $('segBrowser').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-item');
      if (!btn) return;
      api.setBrowser(btn.dataset.browser);
      NF.toast(btn.dataset.browser === 'edge' ? '外框已切换为 Edge' : '外框已切换为 Chrome');
    });

    // 浏览器资料：名称 / 邮箱 / 标签页标题 / 头像
    function bindProfile(id, key, after) {
      $(id).addEventListener('input', function () {
        api.setBrowserProfile(key, this.value);
        if (after) after();
      });
    }
    bindProfile('inpProfileName', 'name', syncAvatarPreview);
    bindProfile('inpProfileEmail', 'email');
    bindProfile('inpTabTitle', 'tabTitle', refreshTabTitle);
    bindProfile('inpAvatarColor', 'avatarColor', syncAvatarPreview);
    $('btnAvatarPick').addEventListener('click', function () { $('avatarFile').click(); });

    // 头像图片：读成 dataURL 存进本地状态
    $('avatarFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { NF.toast('请选择图片文件'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        api.setBrowserProfile('avatar', String(rd.result));
        syncAvatarPreview();
        NF.toast('头像已更新');
      };
      rd.readAsDataURL(f);
    });
    $('btnAvatarClear').addEventListener('click', function () {
      api.setBrowserProfile('avatar', '');
      syncAvatarPreview();
      NF.toast('已恢复为首字母头像');
    });

    // 皮肤
    $('skinGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.skin-card');
      if (!card) return;
      var id = card.dataset.skin;
      var meta = NF.skins.entry(id);
      if (!meta || meta.status !== 'live') {
        NF.toast('「' + (meta ? meta.name : id) + '」皮肤已登记，按插件契约补一个 js + css 即可启用');
        return;
      }
      if (id === state.skin) return;
      mountSkin(id).then(function () { openConsole(false); });
    });

    // 剧本
    $('selScript').addEventListener('change', function () {
      NF.store.patch({ mask: { script: this.value } });
      NF.toast('伪装剧本已切换');
    });

    // 对话模板
    $('tplList').addEventListener('click', function (e) {
      var item = e.target.closest('.tpl-item');
      if (!item) return;
      if (api.insertTemplate(item.dataset.script, +item.dataset.pair)) {
        NF.toast('已插入一组模板问答');
        openConsole(false);
      }
    });
  }

  /* ============================================================
     全局事件
     ============================================================ */
  function bindGlobal() {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var inField = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

      if (e.key === 'Escape') {
        // 浏览器外框的弹出面板 / 页内查找优先吃掉 Esc（和真浏览器一致）
        if (NF.chromeFrame && NF.chromeFrame.anyOpen()) {
          NF.chromeFrame.closePopovers();
          NF.chromeFrame.closeFind();
          return;
        }
        if (!$('console').hidden) { openConsole(false); return; }
        if (t && t.blur) t.blur();
        setPanic(!panic);
        NF.toast(panic ? '已收起（按 Esc 恢复）' : '已展开');
        return;
      }

      // ⌘/Ctrl + B：聊天记录抽屉
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        var open = !api.isSidebarOpen();
        api.setSidebar(open);
        NF.bus.emit('sidebar', open);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        openConsole();
        return;
      }

      // 浏览器级快捷键：缩放 / 查找 / 新标签页（和真 Chrome 同键位）
      if (e.metaKey || e.ctrlKey) {
        var mk = e.key;
        if (mk === '=' || mk === '+') {
          e.preventDefault();
          NF.toast('缩放 ' + Math.round(setZoom((state.ui.zoom || 1) + 0.1) * 100) + '%');
          return;
        }
        if (mk === '-' || mk === '_') {
          e.preventDefault();
          NF.toast('缩放 ' + Math.round(setZoom((state.ui.zoom || 1) - 0.1) * 100) + '%');
          return;
        }
        if (mk === '0') {
          e.preventDefault();
          setZoom(1);
          NF.toast('缩放 100%');
          return;
        }
        if (mk === 'f' || mk === 'F') {
          e.preventDefault();
          NF.bus.emit('find');
          return;
        }
        if (mk === 't' || mk === 'T') {
          e.preventDefault();
          window.open(location.href, '_blank', 'noopener');
          return;
        }
      }

      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      var el = activeFeed && activeFeed.scrollEl;
      var page = el ? el.clientHeight * 0.88 : 0;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (e.shiftKey) { scrollFeed(-page); } else { scrollFeed(page); }
          break;
        case 'j': case 'J':
          e.preventDefault(); scrollFeed(page); break;
        case 'k': case 'K':
          e.preventDefault(); scrollFeed(-page); break;
        case 'ArrowRight':
          e.preventDefault(); api.nextChapter(); syncConsoleProgress(); break;
        case 'ArrowLeft':
          e.preventDefault(); api.prevChapter(); syncConsoleProgress(); break;
        case 'a': case 'A': {
          var v = !state.reading.auto;
          NF.store.patch({ reading: { auto: v } });
          $('swAuto').setAttribute('aria-checked', String(v));
          if (v) startAuto(true); else stopAuto();
          NF.toast(v ? '自动滚动已开启' : '自动滚动已暂停');
          break;
        }
        case '+': case '=': case '-': case '_': {
          var next = state.reading.font + (e.key === '-' || e.key === '_' ? -1 : 1);
          next = U.clamp(next, 12, 22);
          NF.store.patch({ reading: { font: next } });
          $('rFont').value = next;
          $('vFont').textContent = next + ' px';
          applyReadingVars();
          break;
        }
        case 't': case 'T': case 'f': case 'F': case ',': {
          if (e.key === 't' || e.key === 'T') {
            var on = !state.mask.chrome;
            NF.store.patch({ mask: { chrome: on } });
            $('swChrome').setAttribute('aria-checked', String(on));
            applyShell();
          } else if (e.key === 'f' || e.key === 'F') {
            toggleFullscreen();
          } else {
            openConsole();
          }
          break;
        }
      }
    });

    function scrollFeed(px) {
      if (!activeFeed) return;
      autoPaused = true;
      activeFeed.scrollByPx(px);
    }

    // 失焦自动收起
    window.addEventListener('blur', function () {
      if (!state.mask.blurCollapse) return;
      if (!state.mask.openThinking) return;
      if ($('console').hidden) setPanic(true, { byBlur: true });
    });
    window.addEventListener('focus', function () {
      if (panicByBlur) { panicByBlur = false; setPanic(false); }
    });

    window.addEventListener('beforeunload', function () {
      NF.store.saveNow();
    });

    // 浏览器外框：双击标签栏＝最大化 / 还原；Windows 的最大化按钮同效
    $('tabbar').addEventListener('dblclick', function (e) {
      if (e.target.closest('.chrome-tab') || e.target.closest('.win-ctl')) return;
      toggleFullscreen();
    });
    var maxBtn = document.querySelector('.win-ctl[data-win="max"]');
    if (maxBtn) maxBtn.addEventListener('click', toggleFullscreen);

    // 全窗口拖放换书
    var dropEl = $('globalDrop');
    var hasFile = function (e) {
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
    };
    window.addEventListener('dragover', function (e) {
      if (!hasFile(e)) return;
      e.preventDefault();
      dropEl.hidden = false;
    });
    window.addEventListener('dragleave', function (e) {
      if (e.relatedTarget) return;
      dropEl.hidden = true;
    });
    window.addEventListener('drop', function (e) {
      if (!hasFile(e)) return;
      e.preventDefault();
      dropEl.hidden = true;
      handleFiles(e.dataTransfer.files);
    });

    // 进度回写控制台
    NF.bus.on('progress', syncConsoleProgress);
    NF.bus.on('doc', function () { syncBookMeta(); buildChapterList(); });
    NF.bus.on('mask', syncMaskUI);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      $('app').classList.remove('is-fs');
    } else {
      var el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(function () { /* 用户拒绝 */ });
      $('app').classList.add('is-fs');
    }
  }

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) $('app').classList.remove('is-fs');
  });

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    NF.chat.ensure();

    var text = state.novel.text || NF.data.sampleNovel.text;
    var title = state.novel.title || NF.data.sampleNovel.title;
    NF.novel.parse(text, title);

    // 进度上界纠正（换过书或文件变短时）
    var n = NF.novel.chapterCount();
    state.progress.chapter = U.clamp(state.progress.chapter || 0, 0, Math.max(0, n - 1));
    state.progress.loadedThrough = U.clamp(state.progress.loadedThrough || 0,
      state.progress.chapter, Math.max(0, n - 1));

    applyShell();

    buildChapterList();
    syncBookMeta();
    buildSkinGrid();
    buildScriptSelect();
    buildTplList();
    buildHelp();
    bindConsole();
    bindGlobal();
    bindAutoPause();
    applyReadingVars();
    syncConsoleProgress();
    syncMaskUI();

    // 浏览器外框：图标注入、弹出面板、外观联动（必须在 mountSkin 之前接好）
    NF.chromeFrame.init({
      state: function () { return state; },
      patch: function (p) { NF.store.patch(p); },
      toast: NF.toast
    });

    NF.bus.on('open-console', function (pane) { openConsole(true, pane); });

    mountSkin(state.skin || 'deepseek', { silent: true }).then(function () {
      document.body.classList.remove('boot');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.NovelFish);
