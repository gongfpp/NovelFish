/* ============================================================
   chat.js — 会话模型（侧边栏「聊天记录 / 对话列表」的数据源）

   一个会话 = { id, title, age, seq, scriptId, autoSeed, exchanges }
     · age       距今多少天，决定它落在哪个分组（今天 / 昨天 / 7 天内 / 30 天内 / 更早）
     · seq       组内排序用的单调序号，越大越靠前
     · scriptId  这个会话内容取自哪个伪装剧本，保证同一会话里的问答话题一致
     · autoSeed  是否允许自动填充初始问答。手动「新对话」创建的会话为 false，
                 否则新对话一进去就自动长出一堆消息，不像真的
     · exchanges 该会话的问答；小说正文不在这里，始终由阅读引擎提供

   一条问答（exchange）：
     { q, a, mode, scriptId, reasoning, thinkOpen, elapsed, vote }
     · mode      'novel' 深度思考里是小说 / 'model' 深度思考里是模型的真实推理
     · reasoning 仅 mode='model' 有：模型吐出来的思考原文（模型不给就是空串）
     · thinkOpen 这一条渲染时「深度思考」是否默认展开
     · elapsed   表头上「已深度思考（用时 N 秒）」里的 N
     · pending   正在流式生成中。写盘时留着它，刷新页面会被清成「已中断」

   小说阅读进度是全局的：切换会话只换掉伪装问答，阅读位置不受影响。
   ============================================================ */
(function (NF) {
  'use strict';

  var GROUP_ORDER = ['今天', '昨天', '7 天内', '30 天内', '更早'];
  var SEQ_BASE = 1000;      // 默认会话的序号起点，新建会话在此基础上继续加

  /* 单条消息的落盘上限。模型偶尔会吐出很长一段思考，
     不拦的话几次对话就能把 localStorage 撑爆，连带把阅读进度一起挤掉。 */
  var MAX_FIELD = 60000;

  /* 老消息升级只跑一次：ensure() 在热路径上被反复调用，
     每次都过一遍全部会话太亏。 */
  var upgraded = false;

  function groupOf(age) {
    if (age <= 0) return '今天';
    if (age === 1) return '昨天';
    if (age <= 7) return '7 天内';
    if (age <= 30) return '30 天内';
    return '更早';
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function clip(s) {
    var v = String(s == null ? '' : s);
    return v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) : v;
  }

  /** 一条问答的最小合法形状；老存档里只有 q / a 两个字段，一并补齐 */
  function normalizeItem(it) {
    var out = {
      q: String((it && it.q) || ''),
      a: String((it && it.a) == null ? '' : it.a),
      mode: (it && it.mode) === 'model' ? 'model' : 'novel'
    };
    if (it && it.reasoning) out.reasoning = clip(it.reasoning);
    if (it && it.scriptId) out.scriptId = String(it.scriptId);
    /* 存的是显式值，两个方向都要留：true 表示「这条就是默认展开」，
       不能被后来的全局开关改掉（真实模型对话永远默认展开）。 */
    if (it && typeof it.thinkOpen === 'boolean') out.thinkOpen = it.thinkOpen;
    if (it && it.elapsed) out.elapsed = Number(it.elapsed) || 0;
    if (it && it.vote) out.vote = it.vote;
    if (it && it.pending) out.pending = true;
    return out;
  }

  function chat() { return NF.store.state.chat; }

  /* ---------------- 初始化 / 迁移 ---------------- */

  /**
   * 装载默认会话列表。用模板池按固定顺序生成，保证「刷新后侧边栏稳定」，
   * 不会每次打开都换一批标题。
   */
  function buildDefaults() {
    var ages = [0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 9, 12, 20, 45];
    var total = NF.camouflage.total || 0;
    if (!total) return [];

    var convs = [];
    for (var i = 0; i < ages.length && i < total; i++) {
      var item = NF.camouflage.at(i);
      if (!item) break;
      convs.push({
        id: 'c' + (i + 1),
        title: truncate(item.q, 30),
        age: ages[i],
        seq: SEQ_BASE - i,          // 同一个分组里，越靠前的默认会话越「新」
        scriptId: item.scriptId,
        pairStart: item.pairIndex,
        autoSeed: true,
        exchanges: []
      });
    }
    return convs;
  }

  /** 为一个默认会话补上初始问答（首次打开时才生成，避免一上来就写满本地存储） */
  function seed(conv) {
    conv.exchanges = conv.exchanges || [];
    if (conv.autoSeed === false || conv.exchanges.length) return conv.exchanges;

    var script = null;
    NF.camouflage.raw.forEach(function (s) { if (s.id === conv.scriptId) script = s; });
    if (!script) script = NF.camouflage.raw[0];
    if (!script) return [];

    // 条数在 2~4 之间按序号派生，看起来更像是不同长度的历史对话
    var idNum = parseInt(String(conv.id).replace(/\D/g, ''), 10) || 0;
    var want = Math.min(script.pairs.length, 2 + (idNum % 3));
    var start = typeof conv.pairStart === 'number' ? conv.pairStart : 0;
    var out = [];
    for (var k = 0; k < want; k++) {
      var p = script.pairs[(start + k) % script.pairs.length];
      // 历史会话都是伪装问答，「深度思考」里放的是小说
      if (p) out.push(normalizeItem({ q: p.q, a: p.a, mode: 'novel', scriptId: script.id }));
    }
    conv.exchanges = out;
    return out;
  }

  function ensure() {
    var st = NF.store.state;
    st.chat = st.chat || {};
    var c = st.chat;

    if (!Array.isArray(c.convs) || !c.convs.length) {
      c.convs = buildDefaults();
      // 旧版本把问答直接存在 progress.exchanges 里，迁移成一个会话
      var legacy = (st.progress && st.progress.exchanges) || [];
      if (legacy.length) {
        c.convs.unshift({
          id: 'c-legacy', title: truncate(legacy[0].q, 30), age: 0,
          seq: SEQ_BASE + 1, scriptId: 'auto', autoSeed: false,
          exchanges: legacy.slice()
        });
      }
      if (st.progress) delete st.progress.exchanges;
    }

    // 老状态里没有 seq / autoSeed 的补齐，避免排序抖动
    c.convs.forEach(function (conv, i) {
      if (typeof conv.seq !== 'number') conv.seq = SEQ_BASE - i;
      if (typeof conv.autoSeed !== 'boolean') conv.autoSeed = conv.id.indexOf('n') !== 0;
    });

    if (!upgraded) { upgraded = true; upgradeItems(c); }

    if (typeof c.seqCounter !== 'number') {
      c.seqCounter = c.convs.reduce(function (m, x) { return Math.max(m, x.seq || 0); }, SEQ_BASE);
    }
    if (!c.activeId || !find(c.activeId)) c.activeId = c.convs[0].id;
    return c;
  }

  /**
   * 每个会话一次的老消息升级：补齐 mode 等字段。
   * 顺带把上次流式写到一半就被关掉的那条落成「已中断」——
   * 不然它会被永久标成 pending，界面上一直转圈。
   */
  function upgradeItems(c) {
    var touched = false;
    c.convs.forEach(function (conv) {
      if (!Array.isArray(conv.exchanges)) { conv.exchanges = []; return; }
      for (var i = 0; i < conv.exchanges.length; i++) {
        var raw = conv.exchanges[i];
        var clean = normalizeItem(raw);
        if (!raw || typeof raw.mode !== 'string' || raw.q !== clean.q || raw.a !== clean.a) touched = true;
        conv.exchanges[i] = clean;
      }
      var last = conv.exchanges[conv.exchanges.length - 1];
      if (last && last.pending) {
        delete last.pending;
        if (!last.a) last.a = '（上一次生成被中断）';
        touched = true;
      }
    });
    if (touched) NF.store.save();
  }

  /* ---------------- 查询 ---------------- */

  function find(id) {
    var list = chat().convs;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function active() {
    ensure();
    return find(chat().activeId) || chat().convs[0];
  }

  /** 侧边栏用：按分组返回 [{ label, items: [{ id, title, active, age }] }] */
  function groups(keyword) {
    ensure();
    var kw = String(keyword || '').trim().toLowerCase();
    var buckets = {};
    GROUP_ORDER.forEach(function (g) { buckets[g] = []; });

    chat().convs
      .slice()
      .sort(function (a, b) {
        return (a.age - b.age) || ((b.seq || 0) - (a.seq || 0));
      })
      .forEach(function (conv) {
        if (kw && conv.title.toLowerCase().indexOf(kw) < 0) return;
        var g = groupOf(conv.age);
        if (!buckets[g]) buckets[g] = [];
        buckets[g].push({
          id: conv.id,
          title: conv.title,
          age: conv.age,
          active: conv.id === chat().activeId
        });
      });

    return GROUP_ORDER.map(function (label) {
      return { label: label, items: buckets[label] || [] };
    }).filter(function (g) { return g.items.length; });
  }

  /* ---------------- 变更 ---------------- */

  function select(id) {
    ensure();
    if (!find(id)) return null;
    chat().activeId = id;
    NF.store.save();
    NF.bus.emit('conv', active());
    return active();
  }

  /** 新建会话：空内容，标题保持「新的对话」直到发出第一条消息 */
  function create(opts) {
    ensure();
    opts = opts || {};
    var c = chat();
    c.seqCounter += 1;
    var conv = {
      id: 'n' + c.seqCounter,
      title: '新的对话',
      age: 0,
      seq: c.seqCounter,
      autoSeed: false,               // 新对话就是空的，不自动填充
      scriptId: opts.scriptId || (NF.store.state.mask.script !== 'auto'
        ? NF.store.state.mask.script
        : (NF.camouflage.raw[c.seqCounter % NF.camouflage.raw.length] || {}).id),
      pairStart: c.seqCounter % Math.max(1, NF.camouflage.total),
      exchanges: []
    };
    c.convs.unshift(conv);
    c.activeId = conv.id;
    NF.store.save();
    NF.bus.emit('conv', conv);
    return conv;
  }

  /** 往当前会话追加一组问答；第一条消息会把标题改成提问内容 */
  function append(item) {
    ensure();
    var conv = active();
    var list = seed(conv);
    list.push(normalizeItem(item));
    if (conv.title === '新的对话') conv.title = truncate(item.q, 30);
    conv.age = 0;                              // 有新消息就回到「今天」
    conv.seq = ++chat().seqCounter;             // 并排到今天的最前面
    NF.store.save();
    NF.bus.emit('conv', conv);
    return conv;
  }

  /**
   * 开一轮新对话：先把空壳落盘，再让调用方去流式填充。
   * 先落盘是为了「刷新页面不丢提问」——回答没了可以重新生成，问题没了就找不回来了。
   * @returns {number} 这一组问答在当前会话里的下标
   */
  function begin(item) {
    ensure();
    var conv = active();
    var list = seed(conv);
    var rec = normalizeItem(item);
    rec.a = '';
    rec.reasoning = '';
    rec.pending = true;
    list.push(rec);
    if (conv.title === '新的对话') conv.title = truncate(rec.q, 30);
    conv.age = 0;
    conv.seq = ++chat().seqCounter;
    NF.store.save();
    NF.bus.emit('conv', conv);
    return list.length - 1;
  }

  /** 流式结束（或出错）时把结果写回那一组问答并落盘 */
  function finish(index, patch, convId) {
    ensure();
    var list = listOf(convId);
    var it = list[index];
    if (!it) return null;
    it = list[index] = normalizeItem(it);
    if (patch) {
      if (patch.a != null) it.a = clip(patch.a);
      if (patch.reasoning != null) it.reasoning = clip(patch.reasoning);
      if (patch.mode) it.mode = patch.mode === 'model' ? 'model' : 'novel';
      if (patch.scriptId) it.scriptId = String(patch.scriptId);
      if (typeof patch.thinkOpen === 'boolean') it.thinkOpen = patch.thinkOpen;
      if (patch.elapsed != null) it.elapsed = Number(patch.elapsed) || 0;
      delete it.pending;
      if (patch.pending) it.pending = true;
    }
    NF.store.save();
    return it;
  }

  /** 取当前会话里的第 index 组（原始对象，不是副本） */
  function at(index, convId) {
    ensure();
    return listOf(convId)[index] || null;
  }

  /** 清掉某一组的内容，重新生成前用 */
  function clear(index, convId) {
    ensure();
    var list = listOf(convId);
    var it = list[index];
    if (!it) return null;
    list[index] = normalizeItem({ q: it.q, mode: it.mode, scriptId: it.scriptId, thinkOpen: it.thinkOpen });
    list[index].pending = true;
    NF.store.save();
    return list[index];
  }

  /**
   * 某一组问答所在的数组。
   * 流式响应可能在用户切走会话之后才到 —— 那时候 active() 已经换人了，
   * 照着它收尾就会把上一本书的回答写进新会话。所以发起时要记住会话 id。
   */
  function listOf(convId) {
    if (!convId) return active().exchanges;
    var conv = find(convId);
    return conv ? seed(conv) : [];
  }

  function remove(id) {
    ensure();
    var c = chat();
    var i = c.convs.findIndex(function (x) { return x.id === id; });
    if (i < 0) return false;
    c.convs.splice(i, 1);
    if (!c.convs.length) c.convs = buildDefaults();
    if (c.activeId === id) c.activeId = c.convs[0].id;
    NF.store.save();
    NF.bus.emit('conv', active());
    return true;
  }

  /** 载入新书时调用：保留会话列表结构，清空内容重新生成 */
  function reset() {
    var c = ensure();
    c.convs = buildDefaults();
    c.activeId = c.convs.length ? c.convs[0].id : '';
    c.seqCounter = SEQ_BASE;
    NF.store.save();
    NF.bus.emit('conv', active());
  }

  /**
   * 「重新生成」：给第 index 组问答换一条同剧本的其它回答。
   * 只换内容，不动阅读进度（正文由阅读引擎独立提供）。
   * 真实模型对话由上层重新问一遍模型，这里返回 null 交给它。
   */
  function rollAnswer(index) {
    ensure();
    var conv = active();
    var list = seed(conv);
    var item = list[index];
    if (!item) return null;
    if (item.mode === 'model') return null;

    var script = null;
    NF.camouflage.raw.forEach(function (s) { if (s.id === conv.scriptId) script = s; });
    if (!script) script = NF.camouflage.raw[0];
    if (!script || !script.pairs || script.pairs.length < 2) return null;

    var start = typeof conv.pairStart === 'number' ? conv.pairStart : 0;
    for (var k = 1; k <= script.pairs.length; k++) {
      var p = script.pairs[(start + k) % script.pairs.length];
      if (p && p.a !== item.a) { item.a = p.a; break; }
    }
    conv.exchanges = list;
    NF.store.save();
    return item;
  }

  /** 点赞 / 点踩：v = 1 赞、-1 踩；再点一次取消 */
  function vote(index, v) {
    ensure();
    var list = seed(active());
    var item = list[index];
    if (!item) return 0;
    item.vote = item.vote === v ? 0 : v;
    NF.store.save();
    return item.vote;
  }

  NF.chat = {
    ensure: ensure,
    groups: groups,
    active: active,
    /** 当前会话的问答数组（皮肤直接渲染它） */
    get exchanges() {
      var conv = active();
      return conv ? seed(conv) : [];
    },
    select: select,
    create: create,
    append: append,
    /** 流式对话用：先落一条空壳，结束时再 finish */
    begin: begin,
    finish: finish,
    at: at,
    clear: clear,
    /** 当前会话 id：流式发起时记下来，收尾时传回 finish / clear */
    activeId: function () { ensure(); return chat().activeId; },
    remove: remove,
    reset: reset,
    rollAnswer: rollAnswer,
    vote: vote,
    /** 会话总数（控制台统计用） */
    count: function () { ensure(); return chat().convs.length; }
  };
})(window.NovelFish);
