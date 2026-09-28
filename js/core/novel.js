/* ============================================================
   novel.js — 小说文档模型 + 阅读引擎（feed）
   1) parse  : 文本 → 章节 → 段落
   2) feed   : 把当前章节渲染进皮肤提供的「深度思考」容器，
               滚到底自动续下一章，并负责进度保存 / 恢复 / 裁剪
   ============================================================ */
(function (NF) {
  'use strict';

  var U = NF.util;

  /* 章节标题：第X章 / 第X回 / 第X节 / 卷 / Chapter N / 数字序号标题 */
  var CH_RE = /^\s*(?:第\s*[0-9零一二三四五六七八九十百千万两]{1,8}\s*[章回节卷篇幕]|Chapter\s+\d+|\d{1,4}[、.．]\s*\S)[^\n]{0,40}$/;
  var AUTO_CHUNK_CHARS = 1800; // 无分章标记时按此长度切分

  var doc = {
    title: '未命名',
    chapters: [],   // [{ title, paras: [] }]
    totalChars: 0
  };

  /* ---------------- 解析 ---------------- */

  function splitParagraphs(text) {
    return String(text)
      .split(/\r?\n\s*\r?\n|\r?\n/)
      .map(function (s) { return s.replace(/[\t\u3000]+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function autoChunk(paras) {
    var out = [];
    var buf = [];
    var size = 0;
    paras.forEach(function (p) {
      buf.push(p);
      size += p.length;
      if (size >= AUTO_CHUNK_CHARS) { out.push(buf); buf = []; size = 0; }
    });
    if (buf.length) out.push(buf);
    return out.map(function (ps, i) {
      return { title: '第 ' + (i + 1) + ' 节', paras: ps };
    });
  }

  function parse(text, title) {
    var raw = String(text || '').replace(/\uFEFF/g, '');
    var lines = raw.split(/\r?\n/);
    var chapters = [];
    var cur = null;
    var lead = [];
    var foundMark = false;

    lines.forEach(function (line) {
      var t = line.trim();
      if (t && t.length <= 50 && CH_RE.test(t)) {
        foundMark = true;
        if (cur) chapters.push(cur);
        else if (lead.join('').trim().length >= 40) {
          // 章节标记之前只有零星几个字，多半是书名/作者，不成章
          chapters.push({ title: '引子', paras: splitParagraphs(lead.join('\n')) });
        }
        lead = [];
        cur = { title: t, paras: [] };
        return;
      }
      if (cur) cur.paras.push(line);
      else lead.push(line);
    });

    if (cur) chapters.push(cur);
    if (!foundMark && lead.length) {
      chapters = [{ title: '正文', paras: splitParagraphs(lead.join('\n')) }];
    }

    // 归一化段落
    chapters = chapters
      .map(function (c) {
        return { title: c.title, paras: splitParagraphs(c.paras.join('\n')) };
      })
      .filter(function (c) { return c.paras.length > 0; });

    if (!chapters.length) chapters = [{ title: '正文', paras: ['（空文档）'] }];

    // 只有一章且偏长 → 自动切节，保证有翻章节奏
    var total = chapters.reduce(function (a, c) {
      return a + c.paras.reduce(function (b, p) { return b + p.length; }, 0);
    }, 0);
    if (chapters.length === 1 && total > AUTO_CHUNK_CHARS * 1.5) {
      chapters = autoChunk(chapters[0].paras);
    }

    doc.title = title || '未命名';
    doc.chapters = chapters;
    doc.totalChars = chapters.reduce(function (a, c) {
      return a + c.paras.reduce(function (b, p) { return b + p.length; }, 0);
    }, 0);

    NF.bus.emit('doc', doc);
    return doc;
  }

  /* ---------------- 渲染 ---------------- */

  function escapeOnly(s) { return U.escapeHtml(s); }

  function chapterHtml(i) {
    var c = doc.chapters[i];
    if (!c) return '';
    var html = '<p class="nf-ch">' + escapeOnly(c.title) + '</p>';
    html += c.paras.map(function (p) {
      return '<p class="nf-p">' + escapeOnly(p) + '</p>';
    }).join('');
    return html;
  }

  function chapterChars(i) {
    var c = doc.chapters[i];
    if (!c) return 0;
    return c.paras.reduce(function (a, p) { return a + p.length; }, 0);
  }

  /* ============================================================
     阅读引擎 feed
     skin 侧只需：api.mountThinking(bodyEl, scrollEl)
     ============================================================ */

  var MAX_LOADED = 4;          // 同时驻留的最大章节数，超出从顶部裁剪
  var NEAR_BOTTOM = 260;       // 距底部多少像素触发续章
  var STREAM_DELAY = 480;      // 模拟「继续思考」的停顿

  function createFeed(bodyEl, scrollEl, opts) {
    opts = opts || {};
    var state = NF.store.state;
    var destroyed = false;
    var loading = false;
    var quiet = false;   // 老板键等程序化滚动期间，不把位置写进进度

    var first = U.clamp(state.progress.chapter || 0, 0, Math.max(0, doc.chapters.length - 1));
    var last = U.clamp(state.progress.loadedThrough || first, first, Math.max(0, doc.chapters.length - 1));
    if (last < first) last = first;

    // 绑定滚动容器：默认取最近的可滚动祖先
    if (!scrollEl) {
      var node = bodyEl.parentElement;
      while (node && node !== document.body) {
        var st = getComputedStyle(node);
        if (/(auto|scroll)/.test(st.overflowY) && node.scrollHeight > node.clientHeight + 4) break;
        node = node.parentElement;
      }
      scrollEl = node && node !== document.body ? node : document.scrollingElement;
    }

    function totalHeight() { return bodyEl.scrollHeight; }

    /**
     * 正文容器顶部在滚动内容中的偏移。
     * 阅读位置以「正文容器 + 偏移」记录，而不是绝对 scrollTop——
     * 这样换皮肤、改字号、上方消息增减都不会让进度漂移。
     */
    function bodyTop() {
      return bodyEl.getBoundingClientRect().top -
             scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    }

    /**
     * 当前正在读的章节：以滚动容器顶部下方 20% 处为判定线，
     * 取该线之上最后一个章节块。比「已载入的最后一章」更贴近真实进度。
     */
    function readingChapter() {
      var anchorY = scrollEl.getBoundingClientRect().top + Math.min(56, scrollEl.clientHeight * 0.2);
      var found = null;
      Array.prototype.forEach.call(bodyEl.children, function (el) {
        if (!el.classList || !el.classList.contains('nf-sec')) return;
        if (el.getBoundingClientRect().top <= anchorY) found = +el.getAttribute('data-ch');
      });
      return found === null ? first : found;
    }

    function savePos() {
      state.progress.scrollTop = scrollEl.scrollTop;
      state.progress.feedOffset = scrollEl.scrollTop - bodyTop();
      state.progress.loadedThrough = last;
    }

    function restorePos() {
      var p = state.progress;
      var top = bodyTop();
      var off = typeof p.feedOffset === 'number' ? p.feedOffset : (p.scrollTop || 0) - top;
      // 偏移为负说明阅读位在正文容器之上（例如刚切到本章顶部）：
      // 此时停在正文起始线略上方，让思考框标题行与正文第一段同时可见，
      // 避免落到上一条对话的正文里。
      if (off < 0) off = -Math.min(40, -off);
      scrollEl.scrollTop = Math.max(0, top + off);
    }

    function renderRange(from, to) {
      var html = '';
      for (var i = from; i <= to; i++) {
        if (!doc.chapters[i]) continue;
        html += '<section class="nf-sec" data-ch="' + i + '">' + chapterHtml(i) + '</section>';
      }
      bodyEl.innerHTML = html;
    }

    function pruneIfNeeded() {
      while (last - first + 1 > MAX_LOADED) {
        var sec = bodyEl.querySelector('.nf-sec[data-ch="' + first + '"]');
        if (!sec) break;
        var h = sec.offsetHeight;
        var before = totalHeight();
        sec.remove();
        var after = totalHeight();
        // 顶部被裁掉，补偿滚动位置，避免视觉跳动
        scrollEl.scrollTop -= (h || (before - after));
        first++;
      }
      state.progress.chapter = first;
      state.progress.loadedThrough = last;
    }

    function appendChapter(next) {
      var html = '<section class="nf-sec" data-ch="' + next + '">' + chapterHtml(next) + '</section>';
      bodyEl.insertAdjacentHTML('beforeend', html);
      last = next;
      state.progress.loadedThrough = last;
      pruneIfNeeded();
      NF.store.save();
      NF.bus.emit('progress', progressInfo());
    }

    function appendNext(silent) {
      if (destroyed || loading) return Promise.resolve(false);
      if (last >= doc.chapters.length - 1) return Promise.resolve(false);
      var next = last + 1;

      if (silent) { appendChapter(next); return Promise.resolve(true); }

      loading = true;
      var pending = document.createElement('div');
      pending.className = 'nf-pending';
      pending.innerHTML = '<span class="nf-dots"><i></i><i></i><i></i></span>继续思考中…';
      bodyEl.appendChild(pending);

      return new Promise(function (resolve) {
        setTimeout(function () {
          if (destroyed) { resolve(false); return; }
          pending.remove();
          appendChapter(next);
          loading = false;
          resolve(true);
        }, STREAM_DELAY);
      });
    }

    var onScroll = U.throttle(function () {
      if (quiet || destroyed) return;
      savePos();
      NF.store.save();
      NF.bus.emit('scroll', { scrollTop: scrollEl.scrollTop, feed: api });
      if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < NEAR_BOTTOM) appendNext();
    }, 120);

    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    function progressInfo() {
      var n = doc.chapters.length || 1;
      var cur = readingChapter();
      return {
        chapter: cur,
        first: first,
        loaded: U.clamp(last + 1, 0, n),
        total: n,
        percent: Math.round((cur + 1) / n * 100),
        title: (doc.chapters[cur] || {}).title || ''
      };
    }

    var api = {
      scrollEl: scrollEl,
      bodyEl: bodyEl,
      get loading() { return loading; },
      get range() { return { first: first, last: last }; },

      /** 从当前进度重建内容（换皮肤/换字号后调用） */
      refresh: function (opts) {
        opts = opts || {};
        first = U.clamp(state.progress.chapter || 0, 0, Math.max(0, doc.chapters.length - 1));
        var want = U.clamp(state.progress.loadedThrough || first, first, Math.max(0, doc.chapters.length - 1));
        last = Math.max(first, Math.min(want, first + MAX_LOADED - 1));
        renderRange(first, last);
        if (!opts.keepScroll) restorePos();
        NF.bus.emit('progress', progressInfo());
        return api;
      },

      appendNext: appendNext,

      savePos: function () { savePos(); NF.store.save(); },
      restorePos: restorePos,
      readingChapter: readingChapter,

      /** 跳到指定章节，可选定位到章节顶部 */
      gotoChapter: function (i, atTop) {
        i = U.clamp(i, 0, Math.max(0, doc.chapters.length - 1));
        first = i;
        last = Math.min(i, doc.chapters.length - 1);
        state.progress.chapter = first;
        state.progress.loadedThrough = last;
        renderRange(first, last);
        if (atTop !== false) scrollEl.scrollTop = 0;
        savePos();
        NF.store.save();
        NF.bus.emit('progress', progressInfo());
        return i;
      },

      next: function () { return api.gotoChapter(last + 1, true); },
      prev: function () { return api.gotoChapter(first - 1, true); },

      scrollByPx: function (n) { scrollEl.scrollTop = scrollEl.scrollTop + n; },

      scrollToTop: function () { scrollEl.scrollTop = 0; },

      scrollToBottom: function () { scrollEl.scrollTop = scrollEl.scrollHeight; },

      /** 静默期内的滚动不写入进度（老板键收起/恢复时用） */
      setQuiet: function (v) { quiet = !!v; },

      ensureMore: function () {
        if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < NEAR_BOTTOM) appendNext();
      },

      destroy: function () {
        destroyed = true;
        scrollEl.removeEventListener('scroll', onScroll);
      }
    };

    renderRange(first, last);
    // 渲染完成后再落地滚动位置（需要等布局完成）
    requestAnimationFrame(function () {
      if (destroyed) return;
      if (opts.noRestore) {
        api.scrollToBottom();
        savePos();
        NF.store.save();
      } else {
        restorePos();
      }
    });
    NF.bus.emit('progress', progressInfo());

    return api;
  }

  NF.novel = {
    get doc() { return doc; },
    parse: parse,
    chapterHtml: chapterHtml,
    chapterChars: chapterChars,
    chapterCount: function () { return doc.chapters.length; },
    chapterTitle: function (i) { return (doc.chapters[i] || {}).title || ''; },
    totalChars: function () { return doc.totalChars; },
    /** 目录大纲，供控制台与皮肤侧边栏使用 */
    toc: function () {
      return doc.chapters.map(function (c, i) { return { index: i, title: c.title, paras: c.paras.length }; });
    }
  };

  NF.feed = { create: createFeed };
})(window.NovelFish);
