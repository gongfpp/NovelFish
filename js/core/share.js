/* ============================================================
   share.js — 「分享副本」的编解码

   官网的「分享对话」产出的是一条链接，链接指向服务端上的一份对话副本。
   这个应用没有服务端，所以副本只能自己带着走：
   把整本书压缩后编进链接的 fragment，链接因此**自包含**——
   换台机器把这个链接粘回应用，书就回来了。

   载荷格式：  <版本><方案><base64url 数据>
     '1z…'  deflate-raw 压缩（走 CompressionStream，浏览器原生）
     '1u…'  未压缩，仅当运行环境没有 CompressionStream 时的兜底
   fragment 里只出现 [A-Za-z0-9_-]，不需要再做百分号转义。
   ============================================================ */
(function (NF) {
  'use strict';

  var VERSION = 1;
  var HASH_KEY = '#nf=';

  /**
   * 载荷字符上限。Chromium 的 URL 上限是 2 MB，留一半余量：
   * 超出的书不再塞进链接，由调用方改用文件落地（见 app.js）。
   */
  var LIMIT = 1500000;

  /* ---------------- base64url ---------------- */
  function toB64u(bytes) {
    var s = '';
    var CHUNK = 0x8000;   // 分块，避免 apply 的参数表溢出
    for (var i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64u(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ---------------- deflate-raw ---------------- */
  function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var cs = new CompressionStream('deflate-raw');
      var w = cs.writable.getWriter();
      w.write(bytes);
      w.close();
      return new Response(cs.readable).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('无法解压'));
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  /* ---------------- 编 / 解 ---------------- */

  /** 章节数组 → 可直接放进链接的载荷；超限返回 null */
  function pack(doc) {
    var chapters = (doc && doc.chapters) || [];
    if (!chapters.length) return Promise.resolve(null);

    var json = JSON.stringify({
      t: (doc && doc.title) || '',
      c: chapters.map(function (c) { return [c.title, c.paras]; })
    });
    var bytes = new TextEncoder().encode(json);

    return deflate(bytes).then(function (zip) {
      var payload = String(VERSION) + (zip ? 'z' + toB64u(zip) : 'u' + toB64u(bytes));
      return payload.length > LIMIT ? null : payload;
    });
  }

  /** 载荷 → { title, chapters }；不认识或损坏一律 null（不抛给调用方） */
  function unpack(payload) {
    var m = /^([0-9])([a-z])([A-Za-z0-9_-]+)$/.exec(String(payload || ''));
    if (!m || +m[1] !== VERSION) return Promise.resolve(null);

    var bytes;
    try { bytes = fromB64u(m[3]); } catch (e) { return Promise.resolve(null); }
    var flow = m[2] === 'z' ? inflate(bytes) : Promise.resolve(bytes);

    return flow.then(function (raw) {
      var obj = JSON.parse(new TextDecoder().decode(raw));
      var chapters = ((obj && obj.c) || []).map(function (c) {
        var paras = ((c && c[1]) || []).map(function (p) {
          return String(p == null ? '' : p).replace(/[\t\u3000]+/g, ' ').trim();
        }).filter(function (p) { return p.length > 0; });
        return { title: String((c && c[0]) || '').trim() || '未命名', paras: paras };
      }).filter(function (c) { return c.paras.length > 0; });

      if (!chapters.length) return null;
      return { title: String((obj && obj.t) || '').trim() || '分享的小说', chapters: chapters };
    }).catch(function () { return null; });
  }

  /** 拼一条分享链接。payload 为空时就是官网那种纯 id 链接 */
  function link(id, payload) {
    return 'https://chat.deepseek.com/share/' + id + (payload ? HASH_KEY + payload : '');
  }

  /**
   * 从粘贴进来的内容里认出载荷：整条链接、带 # 的 URL、裸载荷都收。
   * 认不出返回 null。
   */
  function parse(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return null;

    var body;
    var i = s.indexOf(HASH_KEY);
    if (i >= 0) {
      // 载荷是链接的尾巴，取紧随其后的那一段即可：
      // 富文本粘贴常带 </a> 之类的残渣，不能把后面全算进来
      body = (/[A-Za-z0-9_-]+/.exec(s.slice(i + HASH_KEY.length)) || [''])[0];
    } else {
      // 没有 #nf= 前缀时，只有「通篇就是一条裸载荷」才接受
      body = s.replace(/[\s"'<>]+/g, '');
    }
    return /^[0-9][a-z][A-Za-z0-9_-]{32,}$/.test(body) ? body : null;
  }

  /** 分享副本的纯文本形态：超大书落地成文件时用 */
  function exportText(doc) {
    var out = ['《' + ((doc && doc.title) || '未命名') + '》', ''];
    ((doc && doc.chapters) || []).forEach(function (c) {
      out.push(c.title, '');
      c.paras.forEach(function (p) { out.push(p); });
      out.push('');
    });
    return out.join('\n');
  }

  /** 链接 id：长度与字符集都照官网的 /share/<18 位> */
  function newId(n) {
    var s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    for (var i = 0; i < (n || 18); i++) out += s[Math.floor(Math.random() * s.length)];
    return out;
  }

  NF.share = {
    VERSION: VERSION,
    LIMIT: LIMIT,
    HASH_KEY: HASH_KEY,
    pack: pack,
    unpack: unpack,
    link: link,
    parse: parse,
    exportText: exportText,
    newId: newId
  };
})(window.NovelFish);
