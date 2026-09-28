/* ============================================================
   epub.js — EPUB 解析（纯前端，零依赖）
   EPUB 就是一个 ZIP：mimetype + META-INF/container.xml + OPF + 若干 XHTML。
   1) unzip : 读中央目录拿到成员，deflate 成员交给 DecompressionStream('deflate-raw')
   2) opf   : container.xml → OPF → 书名 / manifest / spine（阅读顺序）
   3) toc   : EPUB3 的 nav 文档与 EPUB2 的 NCX —— 目录名比正文里的标题更准
   4) 正文  : 每个 spine 文档 → 按 h1~h3 切节 → 段落数组
   出口：NF.epub.read(file) → { title, creator, chapters: [{ title, paras }] }
   ============================================================ */
(function (NF) {
  'use strict';

  /* ============================================================
     字节工具
     ============================================================ */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }
  /** 64 位小端整数。ZIP64 的偏移不会真的用到 2^53 以上，用 Number 足够 */
  function u64(b, o) { return u32(b, o) + u32(b, o + 4) * 4294967296; }

  /* ============================================================
     文本解码：EPUB 规范要求 UTF-8，但国内重制的书常见 GBK / UTF-16
     ============================================================ */
  function asciiHead(bytes, n) {
    var s = '';
    var end = Math.min(bytes.length, n);
    for (var i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function decodeBytes(bytes) {
    var enc = 'utf-8';
    var body = bytes;

    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      body = bytes.subarray(3);
    } else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      enc = 'utf-16le'; body = bytes.subarray(2);
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      enc = 'utf-16be'; body = bytes.subarray(2);
    } else {
      var head = asciiHead(bytes, 2048);
      var m = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head) ||
              /charset\s*=\s*["']?([\w-]+)/i.exec(head);
      if (m) enc = String(m[1]).toLowerCase();
      if (enc === 'gb2312' || enc === 'gb18030') enc = 'gbk';
      if (enc === 'utf8') enc = 'utf-8';
    }

    try { return new TextDecoder(enc).decode(body); }
    catch (e) { return new TextDecoder('utf-8').decode(body); }
  }

  /* ============================================================
     路径：ZIP 成员名与 OPF 里的 href 全部归一到「不带前导 ./ 的绝对路径」
     ============================================================ */
  function normalize(p) {
    var out = [];
    String(p || '').replace(/\\/g, '/').split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') { out.pop(); return; }
      out.push(seg);
    });
    return out.join('/');
  }

  function dirOf(p) {
    var i = String(p || '').lastIndexOf('/');
    return i < 0 ? '' : String(p).slice(0, i + 1);
  }

  /** href 相对 OPF 所在目录解析；顺便去掉 #fragment 与 ?query */
  function resolve(base, href) {
    var rel = String(href || '').split('#')[0].split('?')[0];
    if (!rel) return '';
    try { rel = decodeURIComponent(rel); } catch (e) { /* 编码坏了就按原样用 */ }
    if (rel.charAt(0) === '/') return normalize(rel);
    return normalize(base + rel);
  }

  /* ============================================================
     ZIP
     ============================================================ */
  function readCentralDirectory(buf) {
    var eocd = -1;
    var min = Math.max(0, buf.length - 22 - 0xffff);
    for (var i = buf.length - 22; i >= min; i--) {
      if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 EPUB（ZIP 目录结尾缺失）');

    var count = u16(buf, eocd + 10);
    var cdOff = u32(buf, eocd + 16);

    // ZIP64：条目数 / 偏移溢出时，真值在 ZIP64 的目录结尾记录里
    if (count === 0xffff || cdOff === 0xffffffff) {
      for (var j = eocd - 20; j >= Math.max(0, eocd - 20 - 0xffff); j--) {
        if (u32(buf, j) !== 0x07064b50) continue;
        var z = u64(buf, j + 8);
        if (u32(buf, z) === 0x06064b50) {
          count = u64(buf, z + 32);
          cdOff = u64(buf, z + 48);
        }
        break;
      }
    }
    if (cdOff >= buf.length) throw new Error('EPUB 结构损坏（目录偏移越界）');

    var index = {};
    var p = cdOff;
    for (var n = 0; n < count && p + 46 <= buf.length; n++) {
      if (u32(buf, p) !== 0x02014b50) break;
      var nameLen = u16(buf, p + 28);
      var extraLen = u16(buf, p + 30);
      var commentLen = u16(buf, p + 32);
      var name = normalize(decodeBytes(buf.subarray(p + 46, p + 46 + nameLen)));
      if (name && name.charAt(name.length - 1) !== '/') {
        index[name] = {
          method: u16(buf, p + 10),
          size: u32(buf, p + 20),      // 压缩后大小，取自中央目录才准
          offset: u32(buf, p + 42)
        };
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (!Object.keys(index).length) throw new Error('EPUB 里没有可读的文件');
    return index;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('这个浏览器不支持 DecompressionStream，无法解压 EPUB');
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  function Zip(buf) {
    this.buf = buf;
    this.index = readCentralDirectory(buf);
  }

  Zip.prototype.has = function (p) { return !!this.index[normalize(p)]; };

  Zip.prototype.read = function (p) {
    var ent = this.index[normalize(p)];
    if (!ent) return Promise.reject(new Error('EPUB 里找不到 ' + p));
    var at = ent.offset;
    if (u32(this.buf, at) !== 0x04034b50) return Promise.reject(new Error('EPUB 结构损坏（成员头无效）'));
    var start = at + 30 + u16(this.buf, at + 26) + u16(this.buf, at + 28);
    var raw = this.buf.subarray(start, start + ent.size);
    if (ent.method === 0) return Promise.resolve(raw);
    if (ent.method === 8) return inflateRaw(raw);
    return Promise.reject(new Error('EPUB 用了不支持的压缩方式 #' + ent.method));
  };

  Zip.prototype.text = function (p) {
    return this.read(p).then(decodeBytes);
  };

  /* ============================================================
     XML / OPF
     ============================================================ */
  function parseXml(str) {
    var p = new DOMParser();
    var doc = null;
    try { doc = p.parseFromString(str, 'application/xhtml+xml'); } catch (e) { doc = null; }
    // 非严格 XHTML（国内重制书很常见）→ 退回 HTML 解析器
    if (hasParserError(doc)) {
      try { doc = p.parseFromString(str, 'text/html'); } catch (e2) { return null; }
    }
    return hasParserError(doc) ? null : doc;
  }

  /**
   * 按 localName 取元素，大小写不敏感。
   * XML 会原样保留源码里的大小写（<h2> 的 tagName 就是 "h2"），
   * 而 HTML 解析器又统一转成大写，所以两边都得兜住。
   */
  function tagsIn(node, tag) {
    var want = String(tag).toLowerCase();
    var all = node.getElementsByTagName('*');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].localName || '').toLowerCase() === want) out.push(all[i]);
    }
    return out;
  }

  function hasParserError(doc) {
    if (!doc || !doc.documentElement) return true;
    if (String(doc.documentElement.localName || '').toLowerCase() === 'parsererror') return true;
    return tagsIn(doc, 'parsererror').length > 0;
  }

  /**
   * 文档自身的 <title>。不能直接用 doc.title——
   * 非 XHTML 命名空间的 XML 文档上它会返回空串。
   */
  function docTitleOf(doc) {
    var t = tagsIn(doc, 'title')[0];
    return t ? String(t.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function findOpfPath(containerXml) {
    var doc = parseXml(containerXml);
    if (!doc) return '';
    var rf = tagsIn(doc, 'rootfile');
    for (var i = 0; i < rf.length; i++) {
      var p = rf[i].getAttribute('full-path');
      if (p) return normalize(p);
    }
    return '';
  }

  function parseOpf(str) {
    var doc = parseXml(str);
    if (!doc) throw new Error('OPF 清单解析失败');

    var title = '', creator = '';
    var meta = tagsIn(doc, 'metadata')[0];
    if (meta) {
      var ts = tagsIn(meta, 'title');
      var cs = tagsIn(meta, 'creator');
      if (ts.length) title = String(ts[0].textContent || '').replace(/\s+/g, ' ').trim();
      if (cs.length) creator = String(cs[0].textContent || '').replace(/\s+/g, ' ').trim();
    }

    var manifest = {};
    tagsIn(doc, 'item').forEach(function (it) {
      var id = it.getAttribute('id');
      if (!id) return;
      manifest[id] = {
        href: it.getAttribute('href') || '',
        mediaType: it.getAttribute('media-type') || '',
        properties: it.getAttribute('properties') || ''
      };
    });

    var spine = [];
    var ncxId = '';
    var spineEl = tagsIn(doc, 'spine')[0];
    if (spineEl) {
      ncxId = spineEl.getAttribute('toc') || '';
      tagsIn(spineEl, 'itemref').forEach(function (ir) {
        var idref = ir.getAttribute('idref');
        if (idref) spine.push(idref);
      });
    }
    return { title: title, creator: creator, manifest: manifest, spine: spine, ncxId: ncxId };
  }

  /* ============================================================
     目录名：EPUB3 nav 优先，其次 EPUB2 NCX
     返回值以「解析后的正文路径」为键，取第一个（= 该文件的章节名）
     ============================================================ */
  function anchorMap(doc, base, into) {
    tagsIn(doc, 'a').forEach(function (a) {
      var href = a.getAttribute('href');
      var t = String(a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!href || !t) return;
      var key = resolve(base, href);
      if (key && !into[key]) into[key] = t;
    });
  }

  function readToc(zip, opf, opfDir) {
    var names = {};

    var navItem = null;
    Object.keys(opf.manifest).forEach(function (id) {
      if (navItem) return;
      if (/(^|\s)nav(\s|$)/.test(opf.manifest[id].properties)) navItem = opf.manifest[id];
    });

    var chain = Promise.resolve();
    if (navItem && navItem.href) {
      var navPath = resolve(opfDir, navItem.href);
      if (zip.has(navPath)) {
        chain = chain.then(function () {
          return zip.text(navPath).then(function (s) {
            var d = parseXml(s);
            if (!d) return;
            var navs = tagsIn(d, 'nav');
            var toc = null;
            navs.forEach(function (n) {
              if (toc) return;
              var type = n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ||
                         n.getAttribute('epub:type') || '';
              if (/toc/i.test(type)) toc = n;
            });
            if (!toc && navs.length) toc = navs[0];
            if (toc) anchorMap(toc, dirOf(navPath), names);
          });
        });
      }
    }

    var ncx = opf.ncxId ? opf.manifest[opf.ncxId] : null;
    if (!ncx) {
      Object.keys(opf.manifest).forEach(function (id) {
        if (ncx) return;
        if (/dtbncx/i.test(opf.manifest[id].mediaType)) ncx = opf.manifest[id];
      });
    }
    if (ncx && ncx.href) {
      var ncxPath = resolve(opfDir, ncx.href);
      if (zip.has(ncxPath)) {
        chain = chain.then(function () {
          return zip.text(ncxPath).then(function (s) {
            var d = parseXml(s);
            if (!d) return;
            tagsIn(d, 'navPoint').forEach(function (pt) {
              var label = tagsIn(pt, 'text')[0];
              var content = tagsIn(pt, 'content')[0];
              var t = label ? String(label.textContent || '').replace(/\s+/g, ' ').trim() : '';
              var src = content ? (content.getAttribute('src') || '') : '';
              if (!t || !src) return;
              var key = resolve(dirOf(ncxPath), src);
              if (key && !names[key]) names[key] = t;
            });
          });
        });
      }
    }

    return chain.then(function () { return names; });
  }

  /* ============================================================
     XHTML → 章节
     走一遍 DOM：块级元素与 <br> 断段，h1~h3 断节（一章一文件、全书一文件都能吃）
     ============================================================ */
  var SKIP = {
    SCRIPT: 1, STYLE: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, NOSCRIPT: 1, SVG: 1,
    IFRAME: 1, AUDIO: 1, VIDEO: 1, CANVAS: 1, OBJECT: 1, EMBED: 1, MAP: 1, AREA: 1,
    BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, IMG: 1
  };
  var BREAK = {
    P: 1, DIV: 1, BR: 1, HR: 1, LI: 1, UL: 1, OL: 1, DL: 1, DT: 1, DD: 1, PRE: 1,
    BLOCKQUOTE: 1, SECTION: 1, ARTICLE: 1, ASIDE: 1, HEADER: 1, FOOTER: 1, NAV: 1,
    MAIN: 1, FIGURE: 1, FIGCAPTION: 1, TABLE: 1, TR: 1, TD: 1, TH: 1, CAPTION: 1,
    CENTER: 1, ADDRESS: 1, FORM: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };
  var HEADING = { H1: 1, H2: 1, H3: 1 };

  function sectionsOf(doc) {
    var root = doc.body || doc.documentElement;
    if (!root) return [];

    var secs = [];
    var buf = '';       // 当前段落
    var headBuf = '';   // 当前标题
    var inHead = false;

    function last() {
      if (!secs.length) secs.push({ title: '', paras: [] });
      return secs[secs.length - 1];
    }
    function flush() {
      var s = buf.replace(/\s+/g, ' ').trim();
      buf = '';
      if (s) last().paras.push(s);
    }

    (function walk(node) {
      if (node.nodeType === 3) {
        var v = node.nodeValue;
        if (!v) return;
        if (inHead) headBuf += v; else buf += v;
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = String(node.localName || node.tagName || '').toUpperCase();
      if (SKIP[tag]) return;

      var isHead = !!HEADING[tag];
      if (isHead) {
        flush();
        // 本节已经攒了正文 → 标题另起一节
        if (secs.length && secs[secs.length - 1].paras.length) secs.push({ title: '', paras: [] });
        headBuf = '';
        inHead = true;
      } else if (BREAK[tag] && !inHead) {
        flush();
      }

      for (var c = node.firstChild; c; c = c.nextSibling) walk(c);

      if (isHead) {
        inHead = false;
        var t = headBuf.replace(/\s+/g, ' ').trim();
        headBuf = '';
        if (!t) return;
        var sec = secs.length ? secs[secs.length - 1] : null;
        if (sec && !sec.title && !sec.paras.length) sec.title = t;
        else secs.push({ title: t, paras: [] });
      } else if (BREAK[tag]) {
        flush();
      }
    })(root);

    flush();

    return secs.filter(function (s) { return s.paras.length > 0; });
  }

  /**
   * 目录页识别：正文几乎全是链接文字。
   * EPUB2 的书常把目录页混在 spine 里，不排掉就会在书里多出一章乱码。
   * 只看「链接文字占正文的比例」，比看链接条数稳 ——
   * 正文里偶尔出现的脚注链接占比很低，不会误伤。
   */
  function looksLikeToc(doc, paras) {
    if (!paras.length) return false;
    var links = tagsIn(doc, 'a');
    var hrefs = links.filter(function (a) { return a.getAttribute('href'); });
    if (hrefs.length < 4) return false;

    var linkChars = 0;
    hrefs.forEach(function (a) {
      linkChars += String(a.textContent || '').trim().length;
    });
    var total = paras.reduce(function (a, p) { return a + p.length; }, 0);
    return total > 0 && linkChars / total > 0.7;
  }

  function pushSections(out, secs, opt) {
    secs.forEach(function (s, i) {
      if (!s.paras.length) return;
      var title = String(s.title || '').trim() ||
                  String(opt.nav || '').trim() ||
                  String(opt.docTitle || '').trim();
      if (!title) title = i === 0 ? opt.fallback : opt.fallback + '·' + (i + 1);
      out.push({ title: title, paras: s.paras });
    });
  }

  /* ============================================================
     入口
     ============================================================ */
  function baseName(name) {
    return String(name || '').replace(/\.[^.]+$/, '').trim() || '未命名';
  }

  /**
   * @param {File|Blob} file  用户选的 .epub
   * @param {function} [onStep] (done, total) → 解析进度，可用于界面反馈
   * @returns {Promise<{title:string, creator:string, chapters:Array, totalChars:number}>}
   */
  function read(file, onStep) {
    return file.arrayBuffer().then(function (ab) {
      var buf = new Uint8Array(ab);
      if (buf.length < 22) throw new Error('文件太小，不是 EPUB');
      var zip = new Zip(buf);

      var opfPath = '';
      if (zip.has('META-INF/container.xml')) {
        return zip.text('META-INF/container.xml').then(function (s) {
          return findOpfPath(s);
        }).catch(function () { return ''; }).then(function (p) {
          return afterContainer(p);
        });
      }
      return afterContainer('');

      function afterContainer(found) {
        opfPath = found;
        // container.xml 写得随意时，直接在包里找一个 .opf
        if (!opfPath || !zip.has(opfPath)) {
          opfPath = Object.keys(zip.index).filter(function (p) { return /\.opf$/i.test(p); })[0] || '';
        }
        if (!opfPath) throw new Error('EPUB 里找不到 OPF 清单');

        var opfDir = dirOf(opfPath);
        return zip.text(opfPath).then(function (opfXml) {
          var opf = parseOpf(opfXml);
          if (!opf.spine.length) throw new Error('EPUB 的 spine 为空');

          return readToc(zip, opf, opfDir).catch(function () { return {}; })
            .then(function (tocNames) {
              var chapters = [];
              var total = opf.spine.length;

              // 串行解压：一次只压一个文档，内存占用与进度都更可控
              var chain = Promise.resolve();
              opf.spine.forEach(function (idref, i) {
                chain = chain.then(function () {
                  if (onStep) onStep(i + 1, total);
                  var item = opf.manifest[idref];
                  if (!item || !item.href) return;
                  if (/(^|\s)nav(\s|$)/.test(item.properties)) return;     // EPUB3 目录页
                  if (item.mediaType && !/(xhtml|html)/i.test(item.mediaType)) return;

                  var path = resolve(opfDir, item.href);
                  if (!zip.has(path)) return;

                  return zip.read(path).then(function (bytes) {
                    var doc = parseXml(decodeBytes(bytes));
                    if (!doc) return;
                    var secs = sectionsOf(doc);
                    var paras = secs.reduce(function (a, s) { return a.concat(s.paras); }, []);
                    if (looksLikeToc(doc, paras)) return;
                    pushSections(chapters, secs, {
                      nav: tocNames[path] || '',
                      docTitle: docTitleOf(doc),
                      fallback: '第 ' + (chapters.length + 1) + ' 节'
                    });
                  });
                });
              });

              return chain.then(function () {
                // 封面 / 版权页这类残页排掉；若全被排空说明判断过严，那就都留着
                var kept = chapters.filter(function (c) {
                  var n = c.paras.reduce(function (a, p) { return a + p.length; }, 0);
                  return n >= 40;
                });
                if (kept.length) chapters = kept;
                if (!chapters.length) throw new Error('这个 EPUB 里没抽到正文');

                return {
                  title: opf.title || baseName(file.name),
                  creator: opf.creator,
                  chapters: chapters,
                  totalChars: chapters.reduce(function (a, c) {
                    return a + c.paras.reduce(function (b, p) { return b + p.length; }, 0);
                  }, 0)
                };
              });
            });
        });
      }
    });
  }

  NF.epub = {
    read: read,
    _internal: { normalize: normalize, resolve: resolve, parseXml: parseXml, sectionsOf: sectionsOf }
  };
})(window.NovelFish);
