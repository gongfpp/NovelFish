/* ============================================================
   llm.js — 真实模型对话客户端（OpenAI 兼容）

   为什么是「OpenAI 兼容」这一种协议：DeepSeek、智谱、Moonshot、通义、Ollama、
   vLLM、各类中转站都实现了 /chat/completions + SSE，一套代码能覆盖绝大多数场景。
   用户只需要填「接口地址 + Key + 模型名」三样。

   思考通道：流式响应里 reasoning_content（DeepSeek-R1 / GLM-Z 系列）和
   reasoning（部分网关）都认，谁先出现用谁。拿不到就说明这个模型不做思考，
   皮肤那边会把「深度思考」整块隐掉 —— 真实官网也是这么表现的。

   跨域：浏览器直连第三方 API 取决于对方是否回 Access-Control-Allow-Origin。
   fetch 抛 TypeError 时无法区分「被 CORS 挡了」和「网线断了」，所以提示里两种都提，
   并把请求地址原样显示出来，用户能一眼看出是不是地址写错了。
   ============================================================ */
(function (NF) {
  'use strict';

  /** 常见服务商的接入参数。选中后自动填地址和默认模型，省得用户去翻文档 */
  var PRESETS = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    { id: 'ollama', name: 'Ollama（本机）', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
    { id: 'custom', name: '自定义 / 中转站', baseUrl: '', model: '' }
  ];

  function model() { return NF.store.state.model; }
  function list() { return model().services || []; }

  function find(id) {
    var arr = list();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  /** 当前生效的服务；没显式选过就退回列表第一个 */
  function active() {
    var m = model();
    return find(m.activeId) || list()[0] || null;
  }

  /** 填全了才算可用：缺 key 或地址都不算，免得点发送才发现 */
  function ready(svc) {
    svc = svc || active();
    return !!(svc && svc.baseUrl && svc.model);
  }

  var SERVICE_PREFIX = 'svc-';

  function newId() {
    return SERVICE_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function save(svc) {
    var m = model();
    var arr = m.services = (m.services || []).slice();
    var rec = {
      id: svc.id && svc.id.indexOf(SERVICE_PREFIX) === 0 ? svc.id : newId(),
      name: String(svc.name || '').trim() || '未命名服务',
      baseUrl: String(svc.baseUrl || '').trim(),
      apiKey: String(svc.apiKey || '').trim(),
      model: String(svc.model || '').trim(),
      extra: String(svc.extra || '').trim()
    };
    var idx = -1;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { idx = i; break; }
    if (idx >= 0) arr[idx] = rec; else arr.push(rec);

    if (!m.activeId) m.activeId = rec.id;
    NF.store.save();
    NF.bus.emit('model', m);
    return rec.id;
  }

  function remove(id) {
    var m = model();
    var arr = m.services || [];
    var next = arr.filter(function (s) { return s.id !== id; });
    if (next.length === arr.length) return false;
    m.services = next;
    if (m.activeId === id) m.activeId = next.length ? next[0].id : '';
    NF.store.save();
    NF.bus.emit('model', m);
    return true;
  }

  function setActive(id) {
    if (id && !find(id)) return false;
    model().activeId = id || '';
    NF.store.save();
    NF.bus.emit('model', model());
    return true;
  }

  /** 末尾多余的斜杠会让地址拼成 //chat/completions，先抹掉 */
  function endpoint(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '') + '/chat/completions';
  }

  /** 「额外请求参数」那一栏：空着合法（等于没填），写错了要报出来而不是静默丢掉 */
  function parseExtra(text) {
    var s = String(text || '').trim();
    if (!s) return { val: null };
    try {
      var v = JSON.parse(s);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { err: '要是一个 {} 对象' };
      return { val: v };
    } catch (e) {
      return { err: e.message };
    }
  }

  /* ---------------- 错误 ---------------- */
  function fail(kind, message, extra) {
    var e = new Error(message);
    e.kind = kind;
    if (extra) e.detail = extra;
    return e;
  }

  /** 把服务端返回的一坨错误文本压成一行能看的 */
  function brief(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    try {
      var j = JSON.parse(s);
      var m = (j.error && (j.error.message || j.error.code)) || j.message;
      if (m) s = String(m);
    } catch (e) { /* 不是 JSON，原样用 */ }
    return s.length > 180 ? s.slice(0, 180) + '…' : s;
  }

  function httpError(status, text) {
    var msg = brief(text);
    if (status === 401 || status === 403) {
      return fail('auth', 'API Key 无效或没有权限（HTTP ' + status + '）' + (msg ? '：' + msg : ''));
    }
    if (status === 404) {
      return fail('notfound', '接口地址或模型名不对（HTTP 404）' + (msg ? '：' + msg : ''));
    }
    if (status === 429) {
      return fail('rate', '请求太频繁或额度用尽（HTTP 429）' + (msg ? '：' + msg : ''));
    }
    return fail('http', 'HTTP ' + status + (msg ? '：' + msg : ''));
  }

  function networkError(url, err) {
    return fail('network',
      '连不上 ' + url + '。可能是浏览器跨域限制（服务端没回 Access-Control-Allow-Origin），' +
      '或地址写错 / 网络不通。原始错误：' + (err && err.message ? err.message : err));
  }

  /* ---------------- 流式解析 ---------------- */

  /**
   * 从一小段 SSE 事件里取出增量。
   * OpenAI 兼容的流是一行一条 `data: {...}`，最后一条 `data: [DONE]`。
   */
  function deltaOf(json) {
    var c = json && json.choices && json.choices[0];
    if (!c) return null;
    var d = c.delta || c.message || {};
    // 思考通道：DeepSeek-R1 / GLM-Z 用 reasoning_content，部分网关用 reasoning
    var think = d.reasoning_content != null ? d.reasoning_content : (d.reasoning != null ? d.reasoning : '');
    var text = typeof d.content === 'string' ? d.content
             : (Array.isArray(d.content) ? d.content.map(function (p) { return p && p.text || ''; }).join('') : '');
    return { reasoning: String(think || ''), content: String(text || '') };
  }

  function readStream(res, opts) {
    var reader = res.body.getReader();
    var dec = new TextDecoder('utf-8');
    var buf = '';
    var acc = { reasoning: '', content: '' };

    function feed(line) {
      var t = line.trim();
      if (!t || t.charAt(0) === ':') return;      // 空行与注释心跳
      if (t.indexOf('data:') !== 0) return;
      var payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      var json;
      try { json = JSON.parse(payload); } catch (e) { return; }
      var d = deltaOf(json);
      if (!d) return;
      // 第二个参数给的是「累计到现在的全文」，调用方直接拿去渲染，不用自己拼
      if (d.reasoning) {
        acc.reasoning += d.reasoning;
        if (opts.onReasoning) opts.onReasoning(d.reasoning, acc.reasoning);
      }
      if (d.content) {
        acc.content += d.content;
        if (opts.onContent) opts.onContent(d.content, acc.content);
      }
    }

    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { feed(buf); buf = ''; return acc; }
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();                         // 末行可能是半条，留到下一轮
        for (var i = 0; i < lines.length; i++) feed(lines[i]);
        return pump();
      });
    }

    return pump();
  }

  /* ---------------- 请求 ---------------- */

  var STREAM_TIMEOUT = 180000;   // 整轮对话的硬上限，防呆

  /**
   * 发一轮对话。
   * @param {object} opts
   *   service      指定服务，默认取当前生效的
   *   messages     标准 messages 数组
   *   stream       是否流式，默认跟随 state.model.stream
   *   maxTokens    上限（测试连接时用 1）
   *   onReasoning(delta, acc)  思考增量
   *   onContent(delta, acc)    正文增量
   * @returns {{promise: Promise<{reasoning,content}>, abort: function}}
   */
  function chat(opts) {
    opts = opts || {};
    var svc = opts.service || active();
    if (!svc) return rejected(fail('config', '还没有配置模型服务'));
    if (!svc.baseUrl || !svc.model) return rejected(fail('config', '模型服务缺少接口地址或模型名'));

    var url = endpoint(svc.baseUrl);
    var stream = opts.stream != null ? !!opts.stream : !!model().stream;
    var body = { model: svc.model, messages: opts.messages || [], stream: stream };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.temperature != null) body.temperature = opts.temperature;

    // 服务自带的额外参数。缺推理通道的模型靠它开开关（enable_thinking 之类）
    var extra = parseExtra(svc.extra);
    if (extra.err) return rejected(fail('config', '额外参数不是合法 JSON：' + extra.err));
    if (extra.val) Object.keys(extra.val).forEach(function (k) { body[k] = extra.val[k]; });

    var ctl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctl.abort(); }, opts.timeout || STREAM_TIMEOUT);
    if (opts.signal) {
      if (opts.signal.aborted) ctl.abort();
      else opts.signal.addEventListener('abort', function () { ctl.abort(); });
    }

    var headers = { 'Content-Type': 'application/json' };
    if (svc.apiKey) headers.Authorization = 'Bearer ' + svc.apiKey;

    var promise = fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: ctl.signal
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        throw timedOut ? fail('timeout', '请求超时（' + Math.round((opts.timeout || STREAM_TIMEOUT) / 1000) + ' 秒无响应）')
                       : fail('abort', '已取消');
      }
      throw networkError(url, err);
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw httpError(res.status, t); });
      if (stream && res.body && res.body.getReader) return readStream(res, opts);
      return res.json().then(function (json) {
        var d = deltaOf(json) || { reasoning: '', content: '' };
        if (d.reasoning && opts.onReasoning) opts.onReasoning(d.reasoning, d.reasoning);
        if (d.content && opts.onContent) opts.onContent(d.content, d.content);
        return d;
      });
    }).then(function (acc) {
      clearTimeout(timer);
      return acc;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });

    return { promise: promise, abort: function () { clearTimeout(timer); ctl.abort(); } };
  }

  function rejected(err) {
    return { promise: Promise.reject(err), abort: function () {} };
  }

  /**
   * 测试连接：发一条最短的请求，把错误分类直接带回去。
   * 用 max_tokens: 1 把花费压到最低。
   */
  function probe(svc) {
    var t0 = Date.now();
    return chat({
      service: svc,
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      maxTokens: 1,
      timeout: 20000
    }).promise.then(function () {
      return { ok: true, ms: Date.now() - t0, message: '连接正常（' + (Date.now() - t0) + ' ms）' };
    }, function (err) {
      return { ok: false, ms: Date.now() - t0, message: err.message, kind: err.kind };
    });
  }

  NF.llm = {
    PRESETS: PRESETS,
    presets: function () { return PRESETS.slice(); },
    preset: function (id) {
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
      return null;
    },
    services: list,
    active: active,
    ready: ready,
    find: find,
    save: save,
    remove: remove,
    setActive: setActive,
    endpoint: endpoint,
    chat: chat,
    probe: probe,
    /** 给皮肤用：把会话消息转成请求体里的 messages */
    config: model
  };
})(window.NovelFish);
