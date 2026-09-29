/* ============================================================
   tools/mock-llm.js — 本地假模型服务（只给冒烟测试用）

   实现了最小可用的 OpenAI 兼容 /chat/completions：
     · 按 SSE 逐块吐 reasoning_content 再吐 content，让测试能观察到「流」
     · 回 Access-Control-Allow-Origin: *，否则应用跑在另一个端口上根本发不出请求
     · 用几个特定的 Key / 模型名制造 401 / 404 / 500，用来验证错误分类

   用法：const mock = require('./mock-llm'); const srv = await mock.start(8932);
   ============================================================ */
'use strict';
const http = require('http');

/* 固定文案，断言里直接对这两段做比对 */
const REASONING =
  '用户问的是排序算法的稳定性。先分清楚两件事：稳定指相同键值的相对次序是否保持；' +
  '再看具体实现——插入排序逐个后移，天然稳定。好了，可以据此作答。';
const ANSWER =
  '先说结论：冒泡排序和插入排序都是稳定的，快速排序和堆排序不稳定。\n\n' +
  '原因是稳定性取决于「相等元素会不会被交换到对方后面」：\n' +
  '- 冒泡只在严格大于时才交换，相等元素不越位\n' +
  '- 快排的分区会跨区间搬动元素，相等键值的相对次序就被打乱了\n\n' +
  '需要我把归并排序也一起说明吗？';

const CHUNK = 4;        // 每块几个字
const GAP = 40;         // 块与块之间的间隔（毫秒）—— 留出足够间隙让测试观察到「流」

function sse(res, payload) {
  res.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function delta(reasoning, content) {
  const d = {};
  if (reasoning) d.reasoning_content = reasoning;
  if (content) d.content = content;
  return { id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d }] };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function stream(res, { reasoning, content }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(': mock stream open\n\n');

  for (let i = 0; i < reasoning.length; i += CHUNK) {
    if (res.writableEnded) return;
    sse(res, delta(reasoning.slice(i, i + CHUNK), ''));
    await sleep(GAP);
  }
  for (let i = 0; i < content.length; i += CHUNK) {
    if (res.writableEnded) return;
    sse(res, delta('', content.slice(i, i + CHUNK)));
    await sleep(GAP);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function start(port) {
  const calls = [];       // 收到的请求留档，用来断言「这一轮到底有没有打模型」

  const server = http.createServer((req, res) => {
    // 应用跑在 8931，这里不放开跨域就测不到流式
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!/\/chat\/completions$/.test(req.url.split('?')[0])) {
      return json(res, 404, { error: { message: 'no such endpoint' } });
    }

    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { /* 让它按空对象走 */ }
      calls.push({ url: req.url, auth: req.headers.authorization || '', body });

      if (/\bbad-key\b/.test(req.headers.authorization || '')) {
        return json(res, 401, { error: { message: 'Authentication Fails, Your api key is invalid' } });
      }
      if (/no-such-model/.test(body.model || '')) {
        return json(res, 404, { error: { message: 'The model does not exist' } });
      }
      if (/boom-model/.test(body.model || '')) {
        return json(res, 500, { error: { message: 'internal server error' } });
      }

      const text = (body.messages || []).map(m => m.content).join(' ');
      const content = ANSWER + '\n\n（收到 ' + (body.messages || []).length + ' 条上下文）';
      if (!body.stream) {
        return json(res, 200, {
          id: 'mock', object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: content, reasoning_content: '' } }]
        });
      }
      await stream(res, { reasoning: REASONING, content: content });
      void text;
    });
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port,
        calls,
        url: 'http://127.0.0.1:' + port + '/v1',
        close: () => new Promise(r => server.close(r)),
        reset: () => { calls.length = 0; }
      });
    });
  });
}

module.exports = { start, REASONING, ANSWER };

if (require.main === module) {
  start(Number(process.argv[2]) || 8932).then(m => {
    console.log('mock llm listening at ' + m.url);
  });
}
