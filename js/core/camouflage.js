/* ============================================================
   camouflage.js — 伪装剧本引擎
   内容全部来自 js/data/camouflage-scripts.js（可自由增删模板），
   本文件只负责：挑剧本、轮换取问答、生成「最近对话」标题。

   约定：「深度思考」框里放小说正文，问答正文放这里的内容。
   ============================================================ */
(function (NF) {
  'use strict';

  var scripts = (NF.data && NF.data.camouflageScripts) || [];

  /* id → script，以及摊平后的全量问答池 */
  var byId = {};
  var flat = [];   // [{ q, a, topic, script, scriptId, pairIndex }]

  scripts.forEach(function (s) {
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

  var cursor = 0;

  function resolve(id) {
    if (!id || id === 'auto') return scripts;
    return byId[id] ? [byId[id]] : scripts;
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
    if (!flat.length) return null;
    var i = ((index % flat.length) + flat.length) % flat.length;
    return flat[i];
  }

  /** 取指定剧本的第 n 组（控制台「对话模板」里点选插入用） */
  function pair(scriptId, pairIndex) {
    var s = byId[scriptId];
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
    var out = [];
    for (var i = 0; i < Math.min(want, flat.length); i++) out.push(flat[i].q);
    return out;
  }

  /** 短标题：用于会话列表里那些不太适合放整句提问的位置 */
  function topics() {
    return scripts.map(function (s) { return s.topic; });
  }

  NF.camouflage = {
    /** 面板用的剧本摘要 */
    scripts: scripts.map(function (s) {
      return { id: s.id, name: s.name, topic: s.topic, count: s.pairs.length };
    }),
    /** 原始剧本（含全部 pairs），控制台展开模板用 */
    raw: scripts,
    total: flat.length,
    pick: pick,
    at: at,
    pair: pair,
    historyTitles: historyTitles,
    topics: topics,
    reset: function (offset) { cursor = offset || 0; }
  };
})(window.NovelFish);
