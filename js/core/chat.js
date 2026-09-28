/* ============================================================
   chat.js — 会话模型（侧边栏「聊天记录 / 对话列表」的数据源）

   一个会话 = { id, title, age, seq, scriptId, autoSeed, exchanges }
     · age       距今多少天，决定它落在哪个分组（今天 / 昨天 / 7 天内 / 30 天内 / 更早）
     · seq       组内排序用的单调序号，越大越靠前
     · scriptId  这个会话内容取自哪个伪装剧本，保证同一会话里的问答话题一致
     · autoSeed  是否允许自动填充初始问答。手动「新对话」创建的会话为 false，
                 否则新对话一进去就自动长出一堆消息，不像真的
     · exchanges 该会话的伪装问答；小说正文不在这里，始终由阅读引擎提供

   小说阅读进度是全局的：切换会话只换掉伪装问答，阅读位置不受影响。
   ============================================================ */
(function (NF) {
  'use strict';

  var GROUP_ORDER = ['今天', '昨天', '7 天内', '30 天内', '更早'];
  var SEQ_BASE = 1000;      // 默认会话的序号起点，新建会话在此基础上继续加

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
      if (p) out.push({ q: p.q, a: p.a });
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

    if (typeof c.seqCounter !== 'number') {
      c.seqCounter = c.convs.reduce(function (m, x) { return Math.max(m, x.seq || 0); }, SEQ_BASE);
    }
    if (!c.activeId || !find(c.activeId)) c.activeId = c.convs[0].id;
    return c;
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
    if (!conv.exchanges) conv.exchanges = [];
    conv.exchanges.push({ q: item.q, a: item.a });
    if (conv.title === '新的对话') conv.title = truncate(item.q, 30);
    conv.age = 0;                              // 有新消息就回到「今天」
    conv.seq = ++chat().seqCounter;             // 并排到今天的最前面
    NF.store.save();
    NF.bus.emit('conv', conv);
    return conv;
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

  NF.chat = {
    ensure: ensure,
    groups: groups,
    active: active,
    /** 当前会话的伪装问答数组（皮肤直接渲染它） */
    get exchanges() {
      var conv = active();
      return conv ? seed(conv) : [];
    },
    select: select,
    create: create,
    append: append,
    remove: remove,
    reset: reset,
    /** 会话总数（控制台统计用） */
    count: function () { ensure(); return chat().convs.length; }
  };
})(window.NovelFish);
