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

    pickCamouflage: function () { return NF.camouflage.pick(state.mask.script); },
    historyTitles: function (n) { return NF.camouflage.historyTitles(n || 8); },
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

    isPanic: function () { return panic; },
    setOpenThinking: function (v) { state.mask.openThinking = !!v; NF.store.save(); },

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

    on: function (evt, fn) { return NF.bus.on(evt, fn); },
    emit: function (evt, p) { NF.bus.emit(evt, p); },

    /** 皮肤自己实现发送逻辑时，可直接拿一组伪装问答 */
    makeExchange: function () {
      var item = NF.camouflage.pick(state.mask.script);
      state.progress.exchanges.push({ q: item.q, a: item.a });
      NF.store.save();
      return item;
    },
    get exchanges() { return state.progress.exchanges; }
  };

  NF.api = api;

  /* ============================================================
     阅读参数 → CSS 变量
     ============================================================ */
  function applyReadingVars() {
    var r = state.reading;
    var root = document.documentElement.style;
    root.setProperty('--nf-font', r.font + 'px');
    root.setProperty('--nf-line', String(r.line));
    root.setProperty('--nf-width', r.width + 'px');
  }

  /* ============================================================
     小说装载
     ============================================================ */
  function resetProgress() {
    state.progress.chapter = 0;
    state.progress.loadedThrough = 0;
    state.progress.scrollTop = 0;
    state.progress.exchanges = [];
    NF.store.save();
    NF.camouflage.reset(0);
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
  function applyShellMeta(shell) {
    shell = shell || {};
    var url = shell.url || 'chat.deepseek.com';
    var title = shell.title || '新标签页';
    $('omniUrl').textContent = url;
    $('tabTitle').textContent = title;
    document.title = title;
    var fav = $('tabFavicon');
    if (shell.favicon) fav.innerHTML = shell.favicon;
    else fav.innerHTML = '';
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
  function openConsole(v) {
    var open = arguments.length ? v : $('console').hidden;
    $('console').hidden = !open;
    $('scrim').hidden = !open;
    if (open) syncConsoleProgress();
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
  }

  function bindConsole() {
    // 标签页
    $('consoleTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.ctab');
      if (!btn) return;
      Array.prototype.forEach.call(this.children, function (b) { b.classList.toggle('is-active', b === btn); });
      Array.prototype.forEach.call(document.querySelectorAll('.cpane'), function (p) {
        p.classList.toggle('is-active', p.dataset.pane === btn.dataset.tab);
      });
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
    function bindRange(id, key, fmt, after) {
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
        if (after) after(v);
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
    bindSwitch('swChrome', 'chrome', 'mask', function (v) {
      document.getElementById('app').dataset.shell = v ? 'chrome' : 'bare';
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
  }

  /* ============================================================
     全局事件
     ============================================================ */
  function bindGlobal() {
    // 快捷键
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var inField = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

      if (e.key === 'Escape') {
        if (!$('console').hidden) { openConsole(false); return; }
        if (t && t.blur) t.blur();
        setPanic(!panic);
        NF.toast(panic ? '已收起（按 Esc 恢复）' : '已展开');
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        openConsole();
        return;
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
            document.getElementById('app').dataset.shell = on ? 'chrome' : 'bare';
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
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      document.getElementById('app').classList.remove('is-fs');
    } else {
      var el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(function () { /* 用户拒绝 */ });
      document.getElementById('app').classList.add('is-fs');
    }
  }

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) document.getElementById('app').classList.remove('is-fs');
  });

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    var text = state.novel.text || NF.data.sampleNovel.text;
    var title = state.novel.title || NF.data.sampleNovel.title;
    NF.novel.parse(text, title);

    // 进度上界纠正（换过书或文件变短时）
    var n = NF.novel.chapterCount();
    state.progress.chapter = U.clamp(state.progress.chapter || 0, 0, Math.max(0, n - 1));
    state.progress.loadedThrough = U.clamp(state.progress.loadedThrough || 0,
      state.progress.chapter, Math.max(0, n - 1));
    NF.camouflage.reset((state.progress.exchanges || []).length);

    document.getElementById('app').dataset.shell = state.mask.chrome ? 'chrome' : 'bare';

    buildChapterList();
    syncBookMeta();
    buildSkinGrid();
    buildScriptSelect();
    bindConsole();
    bindGlobal();
    bindAutoPause();
    applyReadingVars();
    syncConsoleProgress();

    NF.bus.on('open-console', function () { openConsole(true); });

    mountSkin(state.skin || 'deepseek', { silent: true }).then(function () {
      document.body.classList.remove('boot');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.NovelFish);
