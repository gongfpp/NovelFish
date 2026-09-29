/* ============================================================
   camouflage.js — 伪装剧本引擎

   剧本有两个来源，合成一份列表：
     · 内置：js/data/camouflage-scripts.js（随应用发布）
     · 自建：用户在 设置 → 伪装 里加的，存在 state.mask.customScripts

   一个剧本 = { id, name, topic, triggers[], thinkOpen, pairs[{q,a}], custom }
     · triggers   这个剧本专属的触发词。用户提问里出现任一个，就用这个剧本作答，
                  并且「深度思考」里放小说正文。
     · thinkOpen  命中时「深度思考」是否默认展开（需求里那张开关）
     · custom     自建标记，UI 上据此决定能不能删

   触发词匹配分两层，顺序即优先级：
     1) 各剧本自带的 triggers —— 命中谁就用谁，可以精确指定剧本
     2) 全局「阅读触发词」（state.mask.triggers）—— 命中后用当前选中的剧本，
        选中的是「混合」时按轮换取一组

   约定：「深度思考」框里放小说正文，问答正文放这里的伪装内容。
   ============================================================ */
(function (NF) {
  'use strict';

  var builtin = (NF.data && NF.data.camouflageScripts) || [];

  /* 派生数据的缓存。自定义剧本存在 store 里，随时可能变，
     每次调用都重算一遍会把热路径（renderThread）拖慢。 */
  var cache = null;
  var cursor = 0;

  /* ---------------- 取用户自建剧本 ---------------- */
  function customScripts() {
    var st = NF.store && NF.store.state;
    var list = st && st.mask && st.mask.customScripts;
    return Array.isArray(list) ? list : [];
  }

  function trimList(v) {
    if (Array.isArray(v)) return v.map(function (s) { return String(s).trim(); }).filter(Boolean);
    return String(v == null ? '' : v)
      .split(/[,，、\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /** 补齐字段、剔掉空问答组。内置和自建走同一套，行为才一致 */
  function normalize(s, isCustom) {
    var pairs = ((s && s.pairs) || [])
      .map(function (p) {
        return { q: String((p && p.q) || '').trim(), a: String((p && p.a) == null ? '' : p.a) };
      })
      .filter(function (p) { return p.q; });

    return {
      id: String((s && s.id) || ''),
      name: String((s && s.name) || '未命名剧本'),
      topic: String((s && s.topic) || ''),
      triggers: trimList(s && s.triggers),
      thinkOpen: !(s && s.thinkOpen === false),
      custom: !!isCustom,
      pairs: pairs
    };
  }

  /* ---------------- 合成 ---------------- */
  function build() {
    if (cache) return cache;

    var all = builtin.map(function (s) { return normalize(s, false); })
      .concat(customScripts().map(function (s) { return normalize(s, true); }))
      .filter(function (s) { return s.pairs.length; });

    var byId = {};
    var flat = [];
    all.forEach(function (s) {
      byId[s.id] = s;
      s.pairs.forEach(function (p, i) {
        flat.push({
          q: p.q,
          a: p.a,
          topic: s.topic,
          script: s.name,
          scriptId: s.id,
          pairIndex: i
        });
      });
    });

    cache = { all: all, byId: byId, flat: flat };
    return cache;
  }

  /** 自建剧本增删改之后必须调一次，否则上面那份缓存还是旧的 */
  function reload() { cache = null; }

  /** 当前选中的剧本对象；'auto' 或认不出的 id 返回 null（表示「随便挑」） */
  function selected() {
    var st = NF.store && NF.store.state;
    var id = st && st.mask && st.mask.script;
    if (!id || id === 'auto') return null;
    return build().byId[id] || null;
  }

  function resolve(id) {
    if (!id || id === 'auto') return build().all;
    var s = build().byId[id];
    return s ? [s] : build().all;
  }

  function flatten(pool) {
    var out = [];
    pool.forEach(function (s) {
      s.pairs.forEach(function (p, i) {
        out.push({
          q: p.q,
          a: p.a,
          topic: s.topic,
          script: s.name,
          scriptId: s.id,
          pairIndex: i
        });
      });
    });
    return out;
  }

  /* ---------------- 触发词 ---------------- */

  /** 提问里是否出现了 list 中的某个词；返回命中的那个词，没命中返回 '' */
  function hit(text, list) {
    var s = String(text || '');
    for (var i = 0; i < (list || []).length; i++) {
      var w = list[i];
      if (w && s.indexOf(w) >= 0) return w;
    }
    return '';
  }

  /**
   * 判断这次提问该不该走伪装剧本。
   * @param {string} text 用户在输入框里打的内容
   * @returns {{script: object|null, trigger: string}|null}
   *          script 为 null 表示「用当前选中的剧本」（'auto' 即混合轮换）
   */
  function matchTrigger(text) {
    if (!String(text || '').trim()) return null;

    var all = build().all;
    for (var i = 0; i < all.length; i++) {
      var t = hit(text, all[i].triggers);
      if (t) return { script: all[i], trigger: t };
    }

    var st = NF.store && NF.store.state;
    var g = hit(text, (st && st.mask && st.mask.triggers) || []);
    if (g) return { script: selected(), trigger: g };

    return null;
  }

  /* ---------------- 取内容 ---------------- */

  /** 取下一组伪装问答（轮换，不重复相邻） */
  function pick(id) {
    var all = flatten(resolve(id));
    if (!all.length) return { q: '你好', a: '你好，有什么可以帮你的？' };
    var item = all[cursor % all.length];
    cursor = (cursor + 1) % all.length;
    return item;
  }

  /** 按序号取全量池里的一组（会话按 id 取自己的初始内容时用，可复现） */
  function at(index) {
    var flat = build().flat;
    if (!flat.length) return null;
    var i = ((index % flat.length) + flat.length) % flat.length;
    return flat[i];
  }

  /** 取指定剧本的第 n 组（控制台「对话模板」里点选插入用） */
  function pair(scriptId, pairIndex) {
    var s = build().byId[scriptId];
    if (!s) return null;
    var p = s.pairs[pairIndex];
    if (!p) return null;
    return { q: p.q, a: p.a, topic: s.topic, script: s.name, scriptId: s.id, pairIndex: pairIndex };
  }

  /**
   * 「最近对话」标题：直接用模板里的提问，
   * 固定顺序取前 n 条，保证刷新后侧边栏稳定。
   */
  function historyTitles(n) {
    var want = n || 8;
    var flat = build().flat;
    var out = [];
    for (var i = 0; i < Math.min(want, flat.length); i++) out.push(flat[i].q);
    return out;
  }

  /* ---------------- 自建剧本的增删改 ---------------- */

  var CUSTOM_PREFIX = 'u-';

  function newId() {
    return CUSTOM_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * 写入一条自建剧本。带 id 且存在于自建列表就改，否则新增。
   * @returns {string} 落库后的剧本 id
   */
  function saveCustom(script) {
    var st = NF.store.state;
    var list = st.mask.customScripts = (st.mask.customScripts || []).slice();
    var clean = normalize(script, true);
    clean.id = clean.id && clean.id.indexOf(CUSTOM_PREFIX) === 0 ? clean.id : newId();

    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === clean.id) { idx = i; break; }

    var record = {
      id: clean.id, name: clean.name, topic: clean.topic,
      triggers: clean.triggers, thinkOpen: clean.thinkOpen, pairs: clean.pairs
    };
    if (idx >= 0) list[idx] = record; else list.push(record);

    NF.store.save();
    reload();
    return clean.id;
  }

  function removeCustom(id) {
    var st = NF.store.state;
    var list = st.mask.customScripts || [];
    var next = list.filter(function (s) { return s.id !== id; });
    if (next.length === list.length) return false;
    st.mask.customScripts = next;
    if (st.mask.script === id) st.mask.script = 'auto';
    NF.store.save();
    reload();
    return true;
  }

  NF.camouflage = {
    /** 面板用的剧本摘要（含自建） */
    get scripts() {
      return build().all.map(function (s) {
        return {
          id: s.id, name: s.name, topic: s.topic, count: s.pairs.length,
          triggers: s.triggers.slice(), thinkOpen: s.thinkOpen, custom: s.custom
        };
      });
    },
    /** 原始剧本（含全部 pairs），控制台展开模板用 */
    get raw() { return build().all; },
    get total() { return build().flat.length; },

    pick: pick,
    at: at,
    pair: pair,
    historyTitles: historyTitles,
    topics: function () { return build().all.map(function (s) { return s.topic; }); },
    selected: selected,
    matchTrigger: matchTrigger,

    /** 自建剧本 */
    customId: newId,
    saveCustom: saveCustom,
    removeCustom: removeCustom,
    /** 把「名称 / 填写文本」这类外部输入切成触发词数组 */
    parseTriggers: trimList,

    reload: reload,
    reset: function (offset) { cursor = offset || 0; }
  };
})(window.NovelFish);
