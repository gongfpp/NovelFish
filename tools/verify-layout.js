/* ============================================================
   tools/verify-layout.js — 对几何：把当前的实测值打出来，
   跟下面这张从 chat.deepseek.com 线上样式包抄下来的表逐条比。

   数值来源：https://fe-static.deepseek.com/chat/static/main.<hash>.css
             （类名映射在 main.<hash>.js 的 CSS Modules 表里，
               css/skins/deepseek.css 头部注释存了「官网类名 → 本地变量」全表）
   视口 1470×834。脚本会先把「显示浏览器外框」关掉，让 .ds 正好铺满视口，
   这样实测坐标就和官网视口坐标一一对应，不用再折算外框高度。

   期望值（1470 宽、侧栏展开、外框关闭）：
     外框壳          0,0,1470,834  圆角 0  标签栏/工具栏 display:none
     侧栏            0 … 261       右侧 1px 分隔线
     侧栏 logo 行    12,6,236,48   padding 15px 0 10px 4px，下距 16px
     侧栏 logo       16,21,143,23
     开启新对话      12,70,236,40  圆角 100px / 白底 / 14px 500
     主区            261 … 1470    （宽 1209）
     顶栏            261,0,1209,60
     消息列          x=446 w=840   （261 + (1209 − 840) / 2 = 445.5）
     滚动口内边距    184.5px       （= (1209 − 840) / 2）
     输入框          x=478 w=776   圆角 24px / 左右各 32px
     免责声明        x=478 w=776   11px/16px 居中（首页不渲染）
     用户气泡右缘    1286          （贴合消息列右缘）
     思考表头        高 34px / 16px-28px / rgb(97,102,107) / 图标 16px 右距 6px
     思考正文        padding 5px 0 5px 22px / 14px-24px / 透明底
     思考块→回答     上距 10px
     首页容器        position:absolute，内容列 776，下内边距 64

   用法：node tools/verify-layout.js [输出目录] [假模型端口]
   前提：本机 8931 端口上已经起好静态服务（python3 -m http.server 8931）
   ============================================================ */
'use strict';
const { chromium } = require('playwright');
const mock = require('./mock-llm');
const fs = require('fs');

const OUT = process.argv[2] || '/tmp/nf-layout';
const PORT = Number(process.argv[3] || 8932);
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const FRAME = 0;                        // 外框关掉，内容坐标就等于官网视口坐标
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const srv = await mock.start(PORT);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1470, height: 834 } })).newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('.ds');
  // 关掉浏览器外框（等价于点「设置 → 外观 → 显示浏览器外框」）：
  // 这样 .ds 直接铺满 1470×834，坐标和官网视口一一对应，不用再减去外框高度。
  await page.evaluate(() => {
    const sw = document.getElementById('swChrome');
    if (sw && sw.getAttribute('aria-checked') === 'true') sw.click();
  });
  await page.waitForTimeout(400);

  /* ---- 0. 外框关掉后的残留检查 ---- */
  const bare = await page.evaluate(() => {
    const g = (s, p) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : 'MISSING'; };
    const box = (s) => { const el = document.querySelector(s); if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(','); };
    return {
      shell: document.getElementById('app').dataset.shell,
      chromeBox: box('.chrome'), chromeRadius: g('.chrome', 'borderRadius'),
      tabbar: g('.chrome-tabbar', 'display'), toolbar: g('.chrome-toolbar', 'display'),
      viewportBox: box('.chrome-viewport'), dsBox: box('.ds')
    };
  });
  console.log('BARE ' + JSON.stringify(bare, null, 1));

  /* ---- 1. 首页态：新对话 → 空会话 → 欢迎页 ---- */
  await page.locator('.ds-newchat').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/a-home.png' });

  const home = await page.evaluate((FRAME) => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y) - FRAME, w: Math.round(b.width),
               h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) - FRAME };
    };
    const cs = (s, p) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; };
    const f = (s) => cs(s, 'fontSize') + '/' + cs(s, 'lineHeight');
    return {
      side: r('.ds-side'), head: r('.ds-side-head'), logo: r('.ds-logo'),
      newchat: r('.ds-newchat'), stage: r('.ds-stage'), welcome: r('.ds-welcome'),
      title: r('.ds-welcome-title'), mark: r('.ds-welcome-mark'),
      box: r('.ds-box'), composer: r('.ds-composer'), disclaimer: r('.ds-disclaimer'),
      boxMaxW: cs('.ds-box', 'maxWidth'), boxRadius: cs('.ds-box', 'borderRadius'),
      stagePos: cs('.ds-stage', 'position'), titleFont: f('.ds-welcome-title')
    };
  }, FRAME);
  console.log('HOME ' + JSON.stringify(home, null, 1));

  /* ---- 2. 对话态：真实模型 + 深度思考 ---- */
  await page.evaluate((port) => NovelFish.api.model.save({
    name: 'X', baseUrl: 'http://127.0.0.1:' + port + '/v1', apiKey: 'sk-1', model: 'deepseek-reasoner'
  }), PORT);
  await page.locator('.ds-input').fill('讲讲排序算法的稳定性');
  await page.locator('.ds-send').click();
  await page.waitForTimeout(9000);
  // 鼠标挪到角落：否则截图会带上「消息悬停」态（底板 + 表头跟随变色）
  await page.mouse.move(1465, 830);
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/b-conv.png' });

  const conv = await page.evaluate((FRAME) => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y) - FRAME, w: Math.round(b.width),
               h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) - FRAME };
    };
    const cs = (s, p) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; };
    const f = (s) => cs(s, 'fontSize') + '/' + cs(s, 'lineHeight');
    return {
      top: r('.ds-top'), topTitle: r('.ds-top-title'), stage: r('.ds-stage'),
      thread: r('.ds-thread'), inner: r('.ds-thread-inner'),
      box: r('.ds-box'), composer: r('.ds-composer'), disclaimer: r('.ds-disclaimer'),
      bubble: r('.ds-bubble'),
      think: r('.ds-think'), head: r('.ds-think-head'), icon: r('.ds-think-icon'),
      label: r('.ds-think-label'), chev: r('.ds-chev'), body: r('.ds-think-body'),
      answer: r('.ds-answer'),
      headFont: f('.ds-think-head'), headColor: cs('.ds-think-head', 'color'),
      headH: cs('.ds-think-head', 'height'),
      bodyFont: f('.ds-think-body'), bodyColor: cs('.ds-think-body', 'color'),
      bodyBg: cs('.ds-think-body', 'backgroundColor'),
      bodyPadL: cs('.ds-think-body', 'paddingLeft'), bodyPadT: cs('.ds-think-body', 'paddingTop'),
      disclaimerFont: f('.ds-disclaimer'),
      stagePos: cs('.ds-stage', 'position'),
      threadPadL: cs('.ds-thread', 'paddingLeft'),
      composerMarginL: cs('.ds-composer', 'marginLeft'),
      labelText: (document.querySelector('.ds-think-label') || {}).textContent,
      answerMarginTop: cs('.ds-answer', 'marginTop')
    };
  }, FRAME);
  console.log('CONV ' + JSON.stringify(conv, null, 1));

  await browser.close();
  await srv.close();
})().catch(e => { console.error(e); process.exit(1); });
