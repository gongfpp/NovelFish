/* ============================================================
   tools/smoke.js — 端到端冒烟测试（Playwright + Chromium）
   覆盖：
     核心渲染 / 老板键（Ctrl+D，只收不放）/ 切章 / 滚动续章 / 发送消息 / 控制台 /
     排版参数 / 皮肤热切换 / 刷新恢复 /
     macOS 与 Windows 双外框 / Chrome 与 Edge 双外框 /
     地址栏与工具栏图标注入 / 站点信息、扩展程序、个人资料、主菜单四个面板 /
     侧边栏开关 / 对话列表切换与搜索 /
      「深度思考」表头冻结吸顶 / 消息操作条 / 分享弹窗 /
     标签页标题与登录头像自定义 / 主菜单的查找、缩放、全屏、删除浏览数据 /
     模板库 / file:// 可用性 / EPUB 导入（nav 分章、NCX 分章、坏文件兜底）/
     分享副本（链接自包含整本书、粘回窗口或地址栏接收、超长书落文件）/
     打字提问的触发词分流（命中走剧本、不命中走真实模型）/ 流式思考与逐字回答 /
     自建伪装剧本与专属触发词 / 模型服务配置与错误分类
   运行：
     cd <项目根> && python3 -m http.server 8931 --bind 127.0.0.1 &
     NODE_PATH=<playwright 所在 node_modules> node tools/smoke.js
   （脚本自己会在 8932 起一个假模型服务，不需要任何真实 API Key）
   截图输出到 $SHOT（默认 /tmp/nf-shots）
   退出码：0 全通过 / 1 有断言失败 / 2 崩溃
   ============================================================ */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mockMod = require('./mock-llm');

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const SHOT = process.env.SHOT || '/tmp/nf-shots';
const FILE_URL = process.env.FILE_URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
const MOCK_PORT = Number(process.env.MOCK_PORT || 8932);

/* 上传头像用的 1x1 PNG，跑完就删 */
const AVATAR_PNG = path.join(os.tmpdir(), 'nf-avatar-' + process.pid + '.png');
fs.writeFileSync(AVATAR_PNG, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'));

/* EPUB 样本，以及一份「扩展名是 epub、其实是纯文本」的坏文件（跑完就删） */
const EPUB_V3 = path.join(__dirname, 'fixtures', 'sample.epub');
const EPUB_NCX = path.join(__dirname, 'fixtures', 'sample-ncx.epub');
const FAKE_EPUB = path.join(os.tmpdir(), 'nf-fake-' + process.pid + '.epub');
fs.writeFileSync(FAKE_EPUB, '这不是压缩包，只是一个改了扩展名的文本文件\n');

/* ---------- 分享副本用的三份临时书（跑完就删） ---------- */
// 小书：书名取自文件名，用来验证「链接把整本书带走」
const SHARE_TXT = path.join(os.tmpdir(), '潮汐拾遗.txt');
fs.writeFileSync(SHARE_TXT, [
  '第一章 灯塔', '',
  '灯芯第三次熄灭的时候，守塔人把铜壶里的油倒回木桶，重新数了一遍刻度。',
  '海面翻着白边，雾从东边推上来，把栈桥一节一节吃掉。', '',
  '第二章 锚地', '',
  '锚链在水下响了整整一夜，第二天清早，船尾多了一道崭新的划痕。',
  '没有人承认夜里动过缆绳，也没有人真的睡着。', '',
  '第三章 信风', '',
  '信风来的那天，岛上所有的风车都朝同一个方向转，像有人在暗处发了令。',
  '学徒把观测簿翻到最后一页，发现上一页的字迹被人用指甲刮掉了。'
].join('\n'), 'utf8');

// 用来在被分享前「换掉正在读的书」，好在收到副本时能看出书确实换回来了
const OTHER_TXT = path.join(os.tmpdir(), '靠岸记.txt');
fs.writeFileSync(OTHER_TXT, [
  '第一章 靠岸', '',
  '船在雾里靠岸，码头的水泥墩上坐着一个人，手里捏着半截烟。',
  '他把烟头摁灭在墩子上，说：你来晚了三天。', '',
  '第二章 交接', '',
  '钥匙在桌上推过来，铜色，齿口磨圆了。两个人都没有伸手。'
].join('\n'), 'utf8');

// 百万字级的长篇：真随机中文，压不动，一定超出链接能承载的长度
const BIG_TXT = path.join(os.tmpdir(), 'nf-big-' + process.pid + '.txt');
(() => {
  const POOL = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感';
  let seed = 987654321;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const paras = [];
  for (let i = 0; i < 24000; i++) {
    let s = '';
    const n = 20 + Math.floor(rnd() * 40);
    for (let k = 0; k < n; k++) s += POOL[Math.floor(rnd() * POOL.length)];
    paras.push(s + '。');
  }
  const lines = [];
  for (let i = 0; i < paras.length; i += 200) {
    lines.push('第 ' + (i / 200 + 1) + ' 章', '');
    for (const p of paras.slice(i, i + 200)) lines.push(p, '');
  }
  fs.writeFileSync(BIG_TXT, lines.join('\n'), 'utf8');
})();

(async () => {
  const errors = [];
  /* 本地假模型服务：验证触发词分流与流式渲染都靠它，不需要真 Key */
  const mock = await mockMod.start(MOCK_PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location() || {};
    errors.push('console.error: ' + m.text() + (loc.url ? '  @ ' + loc.url : ''));
  });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => errors.push('requestfailed ' + r.url()));

  const fail = [];
  const ok = [];
  const check = (name, cond, extra = '') => {
    (cond ? ok : fail).push(name + (cond ? '' : '  <<< FAIL ' + extra));
  };
  const shot = n => page.screenshot({ path: SHOT + '/' + n + '.png' });

  /**
   * 等这一轮流式输出彻底走完。
   * 剧本模式有 0.7s 的「思考」停顿 + 打字机，模型模式看服务端吐多快，
   * 都用固定 sleep 容易写出脆断言，所以直接问应用「还在跑吗」。
   */
  async function settle(max = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      if (!(await page.evaluate(() => !!(window.NovelFish && NovelFish.api.isStreaming())))) {
        await page.waitForTimeout(120);
        return;
      }
      await page.waitForTimeout(80);
    }
  }

  /** 一条助手消息在页面上的当前样子 */
  async function turnView(index) {
    return page.evaluate((i) => {
      const list = NovelFish.chat.exchanges;
      const it = list[i == null ? list.length - 1 : i] || {};
      const node = document.querySelector('.ds-ai-msg[data-idx="' + (i == null ? list.length - 1 : i) + '"]');
      if (!node) return { missing: true, storeMode: it.mode };
      const think = node.querySelector('.ds-think');
      const body = node.querySelector('.ds-think-body');
      return {
        storeMode: it.mode,
        storeAnswer: it.a || '',
        storeReasoning: it.reasoning || '',
        storeElapsed: it.elapsed || 0,
        thinkOpen: think ? think.dataset.open : null,
        thinkCount: node.querySelectorAll('.ds-think').length,
        label: node.querySelector('.ds-think-label') ? node.querySelector('.ds-think-label').textContent : '',
        thinkLen: body ? (body.textContent || '').length : -1,
        streaming: think ? think.classList.contains('is-streaming') : false,
        answerLen: (node.querySelector('.ds-answer').textContent || '').length,
        hasNovel: node.querySelectorAll('.nf-sec').length > 0,
        paras: node.querySelectorAll('.nf-p').length
      };
    }, index == null ? null : index);
  }

  /** 走官网路径进设置面板：侧栏账户行 → 设置 */
  async function openConsole(pane) {
    // 面板已经开着就先关掉：遮罩会吃掉后面所有的点击
    if (await page.locator('#console').isVisible()) {
      await page.locator('#consoleClose').click();
      await page.waitForTimeout(220);
    }
    if (await page.locator('.ds').getAttribute('data-side') === 'closed') {
      await page.locator('.ds-open-side').click();
      await page.waitForTimeout(350);
    }
    await page.locator('.ds-account').click();
    await page.waitForTimeout(220);
    await page.locator('.ds-account-menu [data-menu="settings"]').click();
    await page.waitForTimeout(350);
    if (pane) {
      await page.locator('.ctab[data-tab="' + pane + '"]').click();
      await page.waitForTimeout(180);
    }
  }

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.ds', { timeout: 5000 });
  await page.waitForTimeout(600);

  /* ---------- 1. 骨架 ---------- */
  check('DeepSeek 皮肤已挂载', await page.locator('.ds').count() === 1);
  check('深度思考框默认展开', await page.locator('.ds-think').last().getAttribute('data-open') === '1');
  check('标签页标题正确', (await page.locator('#tabTitle').textContent()).includes('DeepSeek'));
  check('标签页图标渲染成图片（不是裸 SVG 文本）',
    await page.locator('#tabFavicon img').count() === 1);
  check('真实浏览器标签页图标是 data URI',
    /^data:image\/svg\+xml/.test(await page.locator('#pageFavicon').getAttribute('href')),
    await page.locator('#pageFavicon').getAttribute('href'));
  check('地址栏正确', (await page.locator('#omniUrl').textContent()) === 'chat.deepseek.com');
  check('默认是 macOS 外框', await page.locator('#app').getAttribute('data-os') === 'mac');
  check('macOS 下显示交通灯、隐藏窗口控制',
    (await page.locator('.chrome-lights').isVisible()) && !(await page.locator('.win-controls').isVisible()));

  /* ---------- 2. 正文只在思考框里 ---------- */
  await page.waitForSelector('.ds-think-body .nf-p');
  const active = page.locator('.ds-ai-msg').last();
  const pCount = await active.locator('.nf-p').count();
  const firstP = (await active.locator('.nf-p').first().textContent()).trim();
  check('思考框内有正文段落', pCount >= 3, 'count=' + pCount);
  check('正文是小说而非伪装内容', firstP.startsWith('潮汐城所有的灯'), firstP.slice(0, 30) || '(空)');
  check('思考框外没有小说正文',
    !(await page.locator('.ds-answer').first().textContent()).includes('潮汐城'));

  /* ---------- 3. 伪装内容 ---------- */
  const ans = (await page.locator('.ds-answer').first().textContent()) || '';
  check('回答正文有伪装内容', ans.length > 60, 'len=' + ans.length);
  const bubble = (await page.locator('.ds-bubble').first().textContent()) || '';
  check('用户气泡是工作问题', bubble.length > 4, bubble.slice(0, 20));

  /* ---------- 4. 输入框细节 ---------- */
  check('输入框只有一个，占位文案正确',
    await page.locator('.ds-input').getAttribute('placeholder') === '给 DeepSeek 发送消息');
  check('输入框带「深度思考 / 智能搜索」两个能力开关',
    await page.locator('.ds-chip').count() === 2);
  check('发送按钮初始为不可用态',
    await page.locator('.ds-send').getAttribute('data-ready') === '0');
  await page.locator('.ds-input').fill('测试一下按钮状态');
  await page.waitForTimeout(80);
  check('有输入后发送按钮变为可用态',
    await page.locator('.ds-send').getAttribute('data-ready') === '1');
  await page.locator('.ds-input').fill('');
  await page.locator('.ds-input').press('Backspace');
  await page.waitForTimeout(320);   // 等发送按钮的 opacity 过渡跑完，否则量到中间值

  /* ---------- 4b. 输入区几何逐条对齐官网 ----------
     官网类：._77cefa5(框) / ._27c9245(文本框) / .ec4f5d61(工具行) / ._52c986b(发送) */
  const comp = await page.evaluate(() => {
    const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const wh = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    };
    const box = cs('.ds-box'), input = cs('.ds-input'), bar = cs('.ds-box-bar');
    const chip = cs('.ds-chip'), send = cs('.ds-send');
    return {
      boxRadius: box && box.borderRadius,
      boxPadding: box && box.padding,
      boxBorder: box && box.borderTopWidth + ' ' + box.borderTopColor,
      boxBg: box && box.backgroundColor,
      boxShadow: box && box.boxShadow,
      boxOverflow: box && box.overflow,
      inputPadding: input && input.padding,
      inputMinH: input && input.minHeight,
      inputMaxH: input && input.maxHeight,
      inputFont: input && input.fontSize + '/' + input.lineHeight,
      inputBox: input && input.boxSizing,
      inputCaret: input && input.caretColor,
      barPadding: bar && bar.padding,
      barMarginTop: bar && bar.marginTop,
      toolsGap: cs('.ds-tools') && cs('.ds-tools').gap,
      attachWH: wh('.ds-attach'),
      sendWH: wh('.ds-send'),
      sendBg: send && send.backgroundColor,
      sendOpacity: send && send.opacity,
      chipWH: wh('.ds-chip'),
      chipRadius: chip && chip.borderRadius,
      chipFont: chip && chip.fontSize + '/' + chip.fontWeight,
      chipIcon: wh('.ds-chip svg'),
      disclaimer: cs('.ds-disclaimer') && cs('.ds-disclaimer').fontSize + '/' + cs('.ds-disclaimer').lineHeight
    };
  });

  check('输入框圆角 24px、无内边距、overflow:hidden（官网 ._77cefa5）',
    comp.boxRadius === '24px' && comp.boxPadding === '0px' && comp.boxOverflow === 'hidden',
    [comp.boxRadius, comp.boxPadding, comp.boxOverflow].join(' '));
  check('输入框是 1px rgba(0,0,0,.1) 白底',
    comp.boxBorder === '1px rgba(0, 0, 0, 0.1)' && comp.boxBg === 'rgb(255, 255, 255)',
    comp.boxBorder + ' / ' + comp.boxBg);
  check('会话中的输入框用官网会话态阴影',
    /rgba\(0, 0, 0, 0\.02\) 0px 4px 10px/.test(comp.boxShadow) &&
    /rgba\(0, 0, 0, 0\.04\) 0px 2px 4px/.test(comp.boxShadow),
    comp.boxShadow);
  check('文本框内边距是 12px 12px 0 16px（官网 ._27c9245）',
    comp.inputPadding === '12px 12px 0px 16px', comp.inputPadding);
  check('文本框最小两行 60px、上限 336px',
    comp.inputMinH === '60px' && comp.inputMaxH === '336px',
    comp.inputMinH + ' / ' + comp.inputMaxH);
  check('文本框 16px/24px 且 border-box、光标为品牌色',
    comp.inputFont === '16px/24px' && comp.inputBox === 'border-box' &&
    comp.inputCaret === 'rgb(57, 100, 254)',
    [comp.inputFont, comp.inputBox, comp.inputCaret].join(' '));
  check('工具行 padding 12px + margin-top 4px（官网 .ec4f5d61 / ._020ab5b）',
    comp.barPadding === '12px' && comp.barMarginTop === '4px',
    comp.barPadding + ' / ' + comp.barMarginTop);
  check('能力开关间距 10px（官网 .f79352dc 的 margin-right）',
    comp.toolsGap === '10px', comp.toolsGap);
  check('上传按钮与发送按钮都是 34×34 圆形',
    JSON.stringify(comp.attachWH) === '[34,34]' && JSON.stringify(comp.sendWH) === '[34,34]',
    JSON.stringify(comp.attachWH) + ' / ' + JSON.stringify(comp.sendWH));
  check('发送按钮是品牌填充，未就绪时 40% 透明（官网 ._52c986b + .bd74640a）',
    comp.sendBg === 'rgb(57, 100, 254)' && Math.abs(Number(comp.sendOpacity) - 0.4) < 0.02,
    comp.sendBg + ' alpha=' + comp.sendOpacity);
  check('能力开关 34px 高 / 圆角 18px / 13px 500（官网 .ds-toggle-button--m）',
    comp.chipWH[1] === 34 && comp.chipRadius === '18px' && comp.chipFont === '13px/500',
    [comp.chipWH[1], comp.chipRadius, comp.chipFont].join(' '));
  check('能力开关图标 14px（官网 --dsl-toggle-button-icon-size）',
    JSON.stringify(comp.chipIcon) === '[14,14]', JSON.stringify(comp.chipIcon));
  check('免责声明 11px/16px（官网 ._0fcaa63）', comp.disclaimer === '11px/16px', comp.disclaimer);

  await page.locator('.ds-input').fill('测试一下按钮状态');
  await page.waitForTimeout(400);
  check('有输入后发送按钮转为不透明',
    Number(await page.locator('.ds-send').evaluate(e => getComputedStyle(e).opacity)) > 0.99,
    await page.locator('.ds-send').evaluate(e => getComputedStyle(e).opacity));
  await page.locator('.ds-input').fill('');
  await page.waitForTimeout(320);

  /* ---------- 5. 「深度思考」表头冻结吸顶 ---------- */
  check('思考框表头就是冻结条', await page.locator('.ds-think-head').count() >= 1);
  check('DOM 里没有自造的置顶折叠条 / 净读按钮',
    await page.locator('.ds-sticky').count() === 0 &&
    await page.locator('.ds-think-toggle').count() === 0 &&
    await page.locator('.ds-fold-all').count() === 0);

  // 滚进正文（思考块）内部：表头的自然位置被顶出视口，此时应该冻在顶部
  await page.evaluate(() => {
    const t = document.querySelector('.ds-thread');
    const think = document.querySelector('.ds-think[data-open="1"]');
    t.scrollTop += think.getBoundingClientRect().top - t.getBoundingClientRect().top + 420;
  });
  await page.waitForTimeout(400);
  check('滚动位置确实落在思考块内部',
    await page.evaluate(() => {
      const t = document.querySelector('.ds-thread');
      const think = document.querySelector('.ds-think[data-open="1"]');
      const tr = t.getBoundingClientRect(), r = think.getBoundingClientRect();
      return r.top <= tr.top + 2 && r.bottom >= tr.top + 2;
    }));
  const stickDelta = await page.evaluate(() => {
    const t = document.querySelector('.ds-thread');
    const heads = [].slice.call(document.querySelectorAll('.ds-think[data-open="1"] .ds-think-head'));
    const head = heads[heads.length - 1];
    if (!head) return null;
    return head.getBoundingClientRect().top - t.getBoundingClientRect().top;
  });
  check('正文滚过去后思考表头仍冻在顶部',
    stickDelta !== null && Math.abs(stickDelta) < 2, 'delta=' + stickDelta);
  // 官网 ._245c867:after 是 content:"" + 不透明底板 + width:calc(100% + 10px) +
  // height:calc(100% + 1px) + top:-1px。计算值早就被浏览器算成像素了（840+10=850），
  // 所以这里比对「算出来的像素」而不是比对 calc 字符串。
  check('冻结条是不透明底板，且 ::after 按官网 ._245c867:after 盖住整行并右溢 10px',
    await page.locator('.ds-think-head').last().evaluate(e => {
      const cs = getComputedStyle(e);
      const after = getComputedStyle(e, '::after');
      const solid = c => /^rgb\(/.test(c) && !/rgba\(.+,\s*0\)$/.test(c);
      const head = e.getBoundingClientRect();
      return solid(cs.backgroundColor) && solid(after.backgroundColor) &&
             after.top === '-1px' &&
             Math.abs(parseFloat(after.width) - (head.width + 10)) < 1 &&
             Math.abs(parseFloat(after.height) - (head.height + 1)) < 1;
    }),
    await page.locator('.ds-think-head').last().evaluate(e => {
      const head = e.getBoundingClientRect();
      return getComputedStyle(e).backgroundColor + ' / after ' +
        getComputedStyle(e, '::after').backgroundColor + ' ' +
        getComputedStyle(e, '::after').width + '（表头 ' + head.width + 'px）';
    }));
  check('思考表头按官网 ._245c867 定为 34px 高、下距 2px、sticky 吸顶 z-index 7',
    await page.locator('.ds-think-head').last().evaluate(e => {
      const cs = getComputedStyle(e);
      return cs.height === '34px' && cs.marginBottom === '2px' &&
             cs.position === 'sticky' && cs.top === '0px' && cs.zIndex === '7';
    }));
  check('思考表头是 markdown-base 16px/28px + label-secondary（官网 ._4d41763 / ._5ab5d64）',
    await page.locator('.ds-think-head').last().evaluate(e => {
      const cs = getComputedStyle(e);
      return (cs.fontSize + '/' + cs.lineHeight) === '16px/28px' &&
             cs.color === 'rgb(97, 102, 107)';
    }));
  check('思考图标 16px、右侧留 6px（官网 ._4d41763 margin-right）',
    await page.locator('.ds-think-icon').last().evaluate(e => {
      const r = e.getBoundingClientRect();
      return Math.round(r.width) === 16 && Math.round(r.height) === 16 &&
             getComputedStyle(e).marginRight === '6px';
    }));
  check('思考正文 padding 5px 0 5px 22px + 14px/24px + label-secondary（官网 .e1675d8b）',
    await page.locator('.ds-think-body').last().evaluate(e => {
      const cs = getComputedStyle(e);
      return cs.padding === '5px 0px 5px 22px' &&
             (cs.fontSize + '/' + cs.lineHeight) === '14px/24px' &&
             cs.color === 'rgb(97, 102, 107)' &&
             cs.backgroundColor === 'rgba(0, 0, 0, 0)';
    }));
  check('思考图标是品牌蓝（官网 ._245c867 ._970ac5e color:brand-primary）',
    await page.locator('.ds-think-icon').last().evaluate(e =>
      getComputedStyle(e).color === 'rgb(57, 100, 254)'),
    await page.locator('.ds-think-icon').last().evaluate(e => getComputedStyle(e).color));
  /* 官网正文左侧那两个是 div，不是 SVG：5px 圆点 + 1px 竖线。
     圆点容器 16×16 居中盒绝对定位在 (0, 9)，所以圆点自身落在 (5.5, 14.5)。 */
  check('正文左侧 5px 圆点 + 1px 竖线（官网 .a510c7ce / ._9ecc93a）',
    await page.locator('.ds-think-body').last().evaluate(e => {
      const dot = getComputedStyle(e, '::before');
      const rail = getComputedStyle(e, '::after');
      const h = e.getBoundingClientRect().height;
      return dot.width === '5px' && dot.height === '5px' &&
             dot.borderRadius === '50%' && dot.top === '14.5px' && dot.left === '5.5px' &&
             rail.borderLeftWidth === '1px' && rail.left === '7.5px' && rail.top === '31px' &&
             Math.abs(parseFloat(rail.height) - (h - 24)) < 1 &&
             rail.borderLeftColor === 'rgb(225, 229, 238)';
    }),
    await page.locator('.ds-think-body').last().evaluate(e => {
      const dot = getComputedStyle(e, '::before');
      const rail = getComputedStyle(e, '::after');
      const h = Math.round(e.getBoundingClientRect().height);
      return dot.width + '@' + dot.top + '/' + dot.left + ' rail ' +
             rail.borderLeftWidth + ' ' + rail.borderLeftColor + ' ' +
             rail.height + ' (body ' + h + ' → 期望 ' + (h - 24) + ')';
    }));
  check('落定后的圆点转三级灰、动画停掉（官网 .a510c7ce._0652043）',
    await page.locator('.ds-think-body').last().evaluate(e => {
      const dot = getComputedStyle(e, '::before');
      return dot.backgroundColor === 'rgb(129, 133, 140)' && dot.animationName === 'none';
    }),
    await page.locator('.ds-think-body').last().evaluate(e => {
      const dot = getComputedStyle(e, '::before');
      return dot.backgroundColor + ' anim=' + dot.animationName;
    }));
  check('表头下方有 24px 渐隐层，只在吸顶时才显形（官网 .c99b79f8）',
    await page.locator('.ds-think').last().evaluate(t => {
      const cs = getComputedStyle(t.querySelector('.ds-think-head'), '::before');
      const pinned = t.classList.contains('is-pinned');
      return cs.height === '24px' &&
             /linear-gradient/.test(cs.maskImage || cs.webkitMaskImage || '') &&
             cs.opacity === (pinned ? '1' : '0');
    }),
    await page.locator('.ds-think').last().evaluate(t => {
      const cs = getComputedStyle(t.querySelector('.ds-think-head'), '::before');
      return cs.height + ' op=' + cs.opacity + ' pinned=' + t.classList.contains('is-pinned');
    }));
  check('思考块与回答之间 10px（官网 ._74c0879 + .ds-assistant-message-main-content）',
    await page.locator('.ds-ai-msg').last().locator('.ds-answer').evaluate(e =>
      getComputedStyle(e).marginTop === '10px'));

  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(250);
  check('点冻结条即收起该思考框',
    await page.locator('.ds-think').last().getAttribute('data-open') === '0');
  check('收起后正文不可见', !(await page.locator('.ds-think-body .nf-p').last().isVisible()));
  check('收起时 chevron 朝右（官网 oe.A8），没有被 CSS 再转 90°',
    await page.locator('.ds-think').last().evaluate(e => {
      const chev = e.querySelector('.ds-chev');
      const d = chev.querySelector('path').getAttribute('d');
      return /^M5\.5 2\.1514/.test(d) && getComputedStyle(chev).transform === 'none';
    }),
    await page.locator('.ds-think').last().evaluate(e => {
      const chev = e.querySelector('.ds-chev');
      return chev.querySelector('path').getAttribute('d').slice(0, 20) +
             ' tf=' + getComputedStyle(chev).transform;
    }));
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(250);
  check('再点一次恢复展开',
    await page.locator('.ds-think').last().getAttribute('data-open') === '1');

  /* ---------- 6. 老板键：Ctrl+D，只收不放 ---------- */
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  await shot('01-reading');

  // 先滚到正文里一个明确的位置：收起后点开必须原样回来
  const readTop = await page.locator('.ds-thread').evaluate(e => {
    const body = document.querySelector('.ds-ai-msg:last-child .ds-think-body');
    const top = body.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop;
    e.scrollTop = Math.round(top + 620);
    return e.scrollTop;
  });
  await page.waitForTimeout(320);

  await page.keyboard.press('Control+d');
  await page.waitForTimeout(300);
  check('Ctrl+D 收起全部思考框',
    await page.locator('.ds-think[data-open="1"]').count() === 0);
  check('Ctrl+D 收起后仍能看到伪装回答',
    await page.locator('.ds-answer').first().isVisible());
  check('Ctrl+D 收起后正文真的不可见',
    await page.locator('.ds-ai-msg:last-child .nf-p').evaluateAll(
      els => els.every(e => e.getClientRects().length === 0)));
  check('收起后冻结条留在视口里（否则点不回去）',
    await page.locator('.ds-think-head').last().evaluate((h) => {
      const t = document.querySelector('.ds-thread').getBoundingClientRect();
      const r = h.getBoundingClientRect();
      return r.top >= t.top - 2 && r.bottom <= t.bottom;
    }));
  check('老板键进入收起态', await page.evaluate(() => NovelFish.api.isPanic()));
  await shot('02-panic');

  // 只收不放：连按、按 Esc 都只会保持收起
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(250);
  check('再按 Ctrl+D 仍然只是收起，不会展开',
    await page.locator('.ds-think[data-open="1"]').count() === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 已不再是老板键',
    await page.locator('.ds-think[data-open="1"]').count() === 0 &&
    await page.evaluate(() => NovelFish.api.isPanic()));

  // 回到阅读态：点冻结条，和真人手动点开一样
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(420);
  check('点冻结条恢复展开',
    await page.locator('.ds-think').last().getAttribute('data-open') === '1');
  check('点开后自动解除收起态',
    !(await page.evaluate(() => NovelFish.api.isPanic())));
  const readTopAfter = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  check('点开后回到收起前的阅读位置', Math.abs(readTopAfter - readTop) < 80,
    `${readTop} -> ${readTopAfter}`);

  // 点过的表头会留下焦点（官网 .ds-msg:focus-within 就是让操作条保持可见），
  // 这里手动放下，免得影响后面「操作条默认透明」那条断言
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(120);

  /* ---------- 7. 消息操作条与分享（官网有的功能） ---------- */
  // 悬停才出现的操作条（先把鼠标挪开，等 0.2s 的过渡走完，避免上一步的悬停残留）
  await page.mouse.move(6, 6);
  await page.waitForTimeout(360);
  const aiBox = page.locator('.ds-ai-msg').last();
  check('AI 消息的操作条默认透明', await aiBox.locator('.ds-msg-actions').evaluate(
    e => getComputedStyle(e).opacity === '0'));
  await aiBox.hover();
  await page.waitForTimeout(300);
  check('悬停后操作条浮现', await aiBox.locator('.ds-msg-actions').evaluate(
    e => Number(getComputedStyle(e).opacity) > 0.9));
  check('操作条含复制 / 重新生成 / 有帮助 / 没帮助',
    await aiBox.locator('.ds-msg-actions .ds-act').count() === 4,
    String(await aiBox.locator('.ds-msg-actions .ds-act').count()));

  const ansBefore = (await aiBox.locator('.ds-answer').textContent()).trim();
  await aiBox.locator('.ds-act[data-act="regen"]').click();
  await settle();
  const ansAfter = (await page.locator('.ds-ai-msg').last().locator('.ds-answer').textContent()).trim();
  check('「重新生成」换掉了回答正文', ansBefore !== ansAfter,
    ansBefore.slice(0, 18) + ' -> ' + ansAfter.slice(0, 18));
  check('「重新生成」不会改动提问本身',
    (await page.locator('.ds-bubble').last().textContent()).trim().length > 4);
  check('「重新生成」不影响阅读位置',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 2);

  await page.locator('.ds-ai-msg').last().hover();
  await page.waitForTimeout(200);
  await page.locator('.ds-ai-msg').last().locator('.ds-act[data-act="up"]').click();
  await page.waitForTimeout(250);
  check('「有帮助」可以点亮',
    await page.locator('.ds-ai-msg').last().locator('.ds-act[data-act="up"]')
      .evaluate(e => e.classList.contains('is-on')));
  check('点赞状态已落盘',
    await page.evaluate(() => {
      var list = NovelFish.chat.exchanges;
      return list[list.length - 1].vote === 1;
    }));
  await page.locator('.ds-ai-msg').last().locator('.ds-act[data-act="up"]').click();
  await page.waitForTimeout(200);
  check('再点一次取消点赞',
    !(await page.locator('.ds-ai-msg').last().locator('.ds-act[data-act="up"]')
      .evaluate(e => e.classList.contains('is-on'))));

  // 分享弹窗：外观照官网；此时「深度思考」摊开着，链接里会带上正在读的这本书
  check('顶栏有分享按钮', await page.locator('.ds-share-btn').last().isVisible());
  await page.locator('.ds-share-btn').last().click();
  await page.waitForTimeout(300);
  check('分享弹窗可打开', await page.locator('.ds-modal-content').last().isVisible());
  check('分享弹窗是官网的按钮文案',
    (await page.locator('.ds-modal-actions .ds-btn--primary').last().textContent()).trim() === '创建链接');
  check('分享弹窗有「允许对方继续对话」开关',
    await page.locator('.ds-modal-content [data-share="toggle"]').count() === 1);
  check('分享弹窗默认不显示链接',
    await page.locator('.ds-modal-content .ds-linkbox').last().isHidden());
  await page.locator('.ds-modal-actions .ds-btn--primary').last().click();
  await page.waitForTimeout(450);
  check('点「创建链接」后出现分享链接',
    await page.locator('.ds-modal-content .ds-linkbox').last().isVisible());
  const shareUrl = (await page.locator('.ds-modal-content .ds-linkbox span').last().textContent()) || '';
  check('分享链接保持 chat.deepseek.com/share/<18 位> 的形状',
    /^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9]{18}#nf=1z[A-Za-z0-9_-]+$/.test(shareUrl),
    shareUrl.slice(0, 56) + '… (' + shareUrl.length + ' 字符)');
  const sharedBook = await page.evaluate(async (url) => {
    const doc = NovelFish.api.doc;
    const book = await NovelFish.share.unpack(NovelFish.share.parse(url));
    return {
      title: book && book.title,
      chapters: book && book.chapters.length,
      total: doc.chapters.length,
      sameHead: !!book && book.chapters[0].paras[0] === doc.chapters[0].paras[0],
      sameTail: !!book && book.chapters[doc.chapters.length - 1].paras.slice(-1)[0] ===
        doc.chapters[doc.chapters.length - 1].paras.slice(-1)[0]
    };
  }, shareUrl);
  check('链接里的副本就是屏幕上的这本书',
    sharedBook.title === '长夜拾荒' && sharedBook.chapters === sharedBook.total &&
    sharedBook.sameHead && sharedBook.sameTail,
    JSON.stringify(sharedBook));
  check('主按钮变成「复制链接」',
    (await page.locator('.ds-modal-actions .ds-btn--primary').last().textContent()).trim() === '复制链接');
  await shot('03-share');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 关闭分享弹窗', await page.locator('.ds-modal-content').last().isHidden());
  check('关弹窗的那次 Esc 不影响阅读态',
    await page.locator('.ds-think[data-open="1"]').count() >= 1);

  /* ---------- 8. 章节跳转与续章 ---------- */
  // 前面的滚动已经顺带续过章，这里先回到第一章再验证翻章语义
  await page.evaluate(() => NovelFish.api.gotoChapter(0));
  await page.waitForTimeout(450);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const secCount = await active.locator('.nf-sec').count();
  check('下一章后思考框只有新章内容', secCount === 1, 'sec=' + secCount);
  const chTitle = (await active.locator('.nf-ch').first().textContent()).trim();
  check('跳到第二章', chTitle.includes('第二章'), chTitle);

  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(900);
  check('滚到底自动续下一章', (await active.locator('.nf-sec').count()) >= 2);

  /* ---------- 9. 发送消息 ---------- */
  const msgBefore = await page.locator('.ds-ai-msg').count();
  // 带一个阅读触发词：走剧本才出小说，普通问题现在一律交给真实模型
  // （没配模型会被明确退回，见第 24 节），这里要测的是阅读流程下的发送
  await page.locator('.ds-input').fill('帮我把这个方案的落地步骤梳理一下，接着读下去');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(400);
  const msgAfter = await page.locator('.ds-ai-msg').count();
  check('发送后追加新对话', msgAfter === msgBefore + 1, `${msgBefore}->${msgAfter}`);
  check('刚发出时表头是「正在思考」',
    (await page.locator('.ds-ai-msg').last().locator('.ds-think-label').textContent()).trim() === '正在思考',
    await page.locator('.ds-ai-msg').last().locator('.ds-think-label').textContent());
  check('思考中的圆点是品牌蓝 + 1.5s 呼吸（官网 .a510c7ce + @keyframes _4359e9e）',
    await page.locator('.ds-think').last().evaluate(t => {
      if (!t.classList.contains('is-streaming')) return false;
      const dot = getComputedStyle(t.querySelector('.ds-think-body'), '::before');
      return dot.backgroundColor === 'rgb(57, 100, 254)' &&
             /ds-think-pulse/.test(dot.animationName) && dot.animationDuration === '1.5s';
    }),
    await page.locator('.ds-think').last().evaluate(t => {
      const dot = getComputedStyle(t.querySelector('.ds-think-body'), '::before');
      return t.className + ' | ' + dot.backgroundColor + ' ' +
             dot.animationName + ' ' + dot.animationDuration;
    }));
  await settle();
  check('最新思考框处于展开态',
    await page.locator('.ds-think').last().getAttribute('data-open') === '1');
  check('历史思考框全部收起',
    await page.locator('.ds-think[data-open="1"]').count() === 1);
  check('新思考框继续承载小说',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 3);
  const typed = (await page.locator('.ds-bubble').last().textContent()) || '';
  check('输入框里打的字成为提问内容', typed.includes('落地步骤'), typed.slice(0, 20));
  check('回答是逐字打上来的（走完就有完整正文）',
    (await page.locator('.ds-ai-msg').last().locator('.ds-answer').textContent()).trim().length > 40);
  check('表头落定成「已思考（用时 N 秒）」',
    /^已思考（用时 \d+ 秒）$/.test(
      (await page.locator('.ds-ai-msg').last().locator('.ds-think-label').textContent()).trim()),
    await page.locator('.ds-ai-msg').last().locator('.ds-think-label').textContent());

  /* ---------- 10. 左侧对话列表 ---------- */
  check('侧边栏有分组会话列表', await page.locator('.ds-hist-item').count() >= 10);
  const groupLabels = await page.locator('.ds-hist-label').allTextContents();
  check('会话按今天/昨天/7 天内分组',
    groupLabels.includes('今天') && groupLabels.includes('昨天') && groupLabels.includes('7 天内'),
    groupLabels.join(','));
  check('当前会话被标记为选中', await page.locator('.ds-hist-item.is-active').count() === 1);

  const chBeforeConv = await page.evaluate(() => NovelFish.api.currentChapter());
  const titleBeforeConv = await page.locator('.ds-top-title').textContent();
  const otherConv = page.locator('.ds-hist-item').nth(2);
  const otherTitle = await otherConv.textContent();
  await otherConv.click();
  await page.waitForTimeout(500);
  check('点对话列表可切换到别的会话',
    (await page.locator('.ds-top-title').textContent()) !== titleBeforeConv,
    titleBeforeConv + ' -> ' + (await page.locator('.ds-top-title').textContent()));
  check('切换会话后选中项跟着变',
    (await page.locator('.ds-hist-item.is-active').textContent()) === otherTitle);
  const chAfterConv = await page.evaluate(() => NovelFish.api.currentChapter());
  check('切换会话不丢阅读章节', chAfterConv === chBeforeConv,
    `${chBeforeConv} -> ${chAfterConv}`);
  check('切换会话后仍能读到正文',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 2);

  // 搜索：官网侧栏顶部的搜索按钮 → 就地展开输入框（占用「开启新对话」那条槽位）
  const total = await page.locator('.ds-hist-item').count();
  check('侧栏顶部有搜索按钮、下面就是「开启新对话」胶囊',
    await page.locator('.ds-side-search').isVisible() &&
    await page.locator('.ds-newchat').isVisible());
  await page.locator('.ds-side-search').click();
  await page.waitForTimeout(300);
  check('点搜索按钮展开输入框', await page.locator('.ds-search input').isVisible());
  check('搜索展开时「开启新对话」胶囊让位',
    !(await page.locator('.ds-newchat').isVisible()));
  await page.locator('.ds-search input').fill('接口');
  await page.waitForTimeout(450);
  const filtered = await page.locator('.ds-hist-item').count();
  check('搜索能过滤对话列表', filtered >= 1 && filtered < total, `${total} -> ${filtered}`);
  await page.locator('.ds-search-clear').click();
  await page.waitForTimeout(350);
  check('清空搜索后恢复全部对话',
    await page.locator('.ds-hist-item').count() === total);
  check('清空后「开启新对话」胶囊回到原位',
    await page.locator('.ds-newchat').isVisible());

  /* ---------- 10b. 侧栏几何逐条对齐官网 ----------
     官网类：.b8812f16(侧栏) / ._262baab(logo 行) / .e066abb8(logo) / ._5a8ac7a(开启新对话) */
  const sideGeo = await page.evaluate(() => {
    const r = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
    return {
      side: r('.ds-side'), head: r('.ds-side-head'), logo: r('.ds-logo'),
      newchat: r('.ds-newchat'),
      sideBorderRight: cs('.ds-side', 'borderRightWidth'),
      headPad: cs('.ds-side-head', 'padding'),
      headMarginBottom: cs('.ds-side-head', 'marginBottom'),
      newchatRadius: cs('.ds-newchat', 'borderRadius'),
      newchatBg: cs('.ds-newchat', 'backgroundColor'),
      newchatShadow: cs('.ds-newchat', 'boxShadow'),
      newchatFont: cs('.ds-newchat', 'fontSize') + '/' + cs('.ds-newchat', 'fontWeight'),
      newchatIcon: r('.ds-newchat svg'),
      newchatIconMargin: cs('.ds-newchat svg', 'marginRight'),
      hint: getComputedStyle(document.querySelector('.ds-newchat'), '::after').content
    };
  });
  check('侧栏 261px、右侧 1px 分隔线（官网 .b8812f16 / --sider-width）',
    sideGeo.side[2] === 261 && sideGeo.sideBorderRight === '1px',
    sideGeo.side.join(',') + ' border=' + sideGeo.sideBorderRight);
  check('侧栏 logo 行高 48px、padding 15px 0 10px 4px、下距 16px（官网 ._262baab）',
    sideGeo.head[3] === 48 && sideGeo.headPad === '15px 0px 10px 4px' &&
    sideGeo.headMarginBottom === '16px',
    sideGeo.head.join(',') + ' ' + sideGeo.headPad + ' mb=' + sideGeo.headMarginBottom);
  check('侧栏 logo 是官网 143×23（._e066abb8）',
    sideGeo.logo[2] === 143 && sideGeo.logo[3] === 23, sideGeo.logo.join(','));
  check('「开启新对话」胶囊 40px 高 / 圆角 100px / 白底 / 14px 500（官网 ._5a8ac7a）',
    sideGeo.newchat[3] === 40 && sideGeo.newchatRadius === '100px' &&
    sideGeo.newchatBg === 'rgb(255, 255, 255)' && sideGeo.newchatFont === '14px/500',
    sideGeo.newchat.join(',') + ' ' + sideGeo.newchatRadius + ' ' + sideGeo.newchatFont);
  // 官网 ._5a8ac7a 默认是三层阴影，:hover 换成另一套三层阴影。
  // 这段跑的时候鼠标可能正停在胶囊上（前面刚 hover 过），两套都收 —— 都是官网真实值。
  check('胶囊是三层阴影（不是描边），悬停时浮出 ⌘ J 提示',
    (/rgba\(72, 104, 178, 0\.04\) 0px -2px 2px/.test(sideGeo.newchatShadow) &&
     /rgba\(106, 111, 117, 0\.09\) 0px 2px 2px/.test(sideGeo.newchatShadow)
     || /rgba\(72, 104, 178, 0\.04\) 0px 4px 4px/.test(sideGeo.newchatShadow) &&
        /rgba\(106, 111, 117, 0\.1\) 0px 6px 6px/.test(sideGeo.newchatShadow)) &&
    /⌘ J/.test(sideGeo.hint),
    sideGeo.newchatShadow + ' hint=' + sideGeo.hint);
  check('胶囊里的 ⊕ 是 16px、右侧留 6px（官网 ._1c42ad7）',
    sideGeo.newchatIcon[2] === 16 && sideGeo.newchatIcon[3] === 16 &&
    sideGeo.newchatIconMargin === '6px',
    sideGeo.newchatIcon.join(',') + ' mr=' + sideGeo.newchatIconMargin);

  /* ---------- 10c. 主区列宽逐条对齐官网 ----------
     官网：消息列 840px（._765a5cd）、输入框 776px（._871cbca 的 (100% - 840px)/2） */
  const colGeo = await page.evaluate(() => {
    const r = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
    const pv = (sel, v) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(v).trim() : null;
    };
    return {
      thread: r('.ds-thread'), inner: r('.ds-thread-inner'),
      threadPad: cs('.ds-thread', 'paddingLeft'),
      composer: r('.ds-composer'), composerMargin: cs('.ds-composer', 'marginLeft'),
      box: r('.ds-box'), disclaimer: r('.ds-disclaimer'),
      disclaimerFont: cs('.ds-disclaimer', 'fontSize') + '/' + cs('.ds-disclaimer', 'lineHeight'),
      disclaimerAlign: cs('.ds-disclaimer', 'textAlign'),
      top: r('.ds-top'), step: pv('.ds', '--ds-max-w'),
      boxW: pv('.ds', '--ds-box-w'),
      stagePos: cs('.ds-stage', 'position'),
      bubbleRight: r('.ds-bubble'),
      side: r('.ds-side'), stage: r('.ds-stage')
    };
  });
  check('消息列 840px 居中（官网 --message-list-max-width）',
    colGeo.inner[2] === 840 && colGeo.step === '840px', colGeo.inner.join(','));
  // 官网内联 _r：paddingLeft/Right = calc((100% - var(--message-list-max-width)) / 2)。
  // calc 里的 100% 解析成 .ds-thread 的包含块（也就是 .ds-stage 的内容宽），
  // 不是「侧栏 + 主区」—— 侧栏是它的兄弟节点，不参与这条计算。
  const wantPad = ((colGeo.stage[2] - 840) / 2).toFixed(1) + 'px';
  check('滚动口左右内边距是 calc((100% - 840px)/2)（官网内联 _r）',
    colGeo.threadPad === wantPad,
    colGeo.threadPad + ' 期望 ' + wantPad + '（stage ' + colGeo.stage[2] + 'px）');
  check('撑出来的内边距让内含的 840px 列真正居中（内边距 = 列左缘 − 滚动口左缘）',
    Math.abs((colGeo.inner[0] - colGeo.thread[0]) - parseFloat(colGeo.threadPad)) < 1,
    'inner.x=' + colGeo.inner[0] + ' thread.x=' + colGeo.thread[0] +
    ' pad=' + colGeo.threadPad);
  check('输入框 776px（840 − 2×32）、输入区左右各 32px（官网 ._871cbca）',
    colGeo.box[2] === 776 && colGeo.boxW === '776px' && colGeo.composerMargin === '32px',
    colGeo.box.join(',') + ' margin=' + colGeo.composerMargin);
  check('免责声明与输入框同宽、11px/16px 居中（官网 ._0fcaa63）',
    colGeo.disclaimer[2] === 776 && colGeo.disclaimerFont === '11px/16px' &&
    colGeo.disclaimerAlign === 'center',
    colGeo.disclaimer.join(',') + ' ' + colGeo.disclaimerFont);
  check('顶栏 60px 高（官网 ._08dce46）', colGeo.top[3] === 60, colGeo.top.join(','));
  check('用户气泡右边缘贴齐内容列右缘（官网 .fbb737a4）',
    colGeo.bubbleRight[0] + colGeo.bubbleRight[2] ===
    colGeo.inner[0] + colGeo.inner[2],
    colGeo.bubbleRight.join(',') + ' vs ' + colGeo.inner.join(','));

  /* ---------- 11. 侧边栏开关 ---------- */
  await page.locator('.ds-side-collapse').click();
  await page.waitForTimeout(400);
  check('侧边栏可收起', await page.locator('.ds').getAttribute('data-side') === 'closed');
  check('收起后顶栏出现展开按钮', await page.locator('.ds-open-side').isVisible());
  await shot('04-sidebar-closed');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(400);
  check('Ctrl+B 可展开侧边栏', await page.locator('.ds').getAttribute('data-side') === 'open');

  /* ---------- 12. 控制台 ---------- */
  await openConsole();
  check('控制台可打开', await page.locator('#console').isVisible());
  check('章节目录已生成', await page.locator('.chapter-item').count() >= 3);
  check('皮肤清单已渲染', await page.locator('.skin-card').count() >= 6);
  await shot('05-console');

  await page.locator('.ctab[data-tab="mask"]').click();
  await page.waitForTimeout(200);
  const tplCount = await page.locator('.tpl-item').count();
  check('对话模板库已渲染', tplCount >= 40, 'tpl=' + tplCount);
  check('模板数量提示正确',
    /13 类 · 43 组/.test(await page.locator('#tplCount').textContent()),
    await page.locator('#tplCount').textContent());
  check('剧本下拉含全部剧本',
    await page.locator('#selScript option').count() === 14,
    String(await page.locator('#selScript option').count()));
  await shot('06-templates');

  // 插一组模板问答
  const beforeTpl = await page.locator('.ds-ai-msg').count();
  await page.locator('.tpl-item').nth(5).click();
  await page.waitForTimeout(500);
  check('点模板可插入一组问答',
    await page.locator('.ds-ai-msg').count() === beforeTpl + 1,
    `${beforeTpl} -> ${await page.locator('.ds-ai-msg').count()}`);

  /* ---------- 13. 字号参数 ---------- */
  await openConsole('read');
  const fontBefore = await page.locator('.nf-sec').last().evaluate(e => getComputedStyle(e).fontSize);
  await page.locator('#rFont').evaluate(el => {
    el.value = '20';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const fontAfter = await page.locator('.nf-sec').last().evaluate(e => getComputedStyle(e).fontSize);
  check('字号参数生效', fontBefore !== fontAfter && fontAfter === '20px', `${fontBefore}->${fontAfter}`);

  /* ---------- 14. Windows 外框 ---------- */
  await page.locator('.ctab[data-tab="look"]').click();
  await page.waitForTimeout(150);
  await page.locator('.seg-item[data-os="win"]').click();
  await page.waitForTimeout(300);
  check('可切换到 Windows 外框', await page.locator('#app').getAttribute('data-os') === 'win');
  check('Windows 下显示窗口控制按钮', await page.locator('.win-controls').isVisible());
  check('Windows 下隐藏交通灯', !(await page.locator('.chrome-lights').isVisible()));
  check('Windows 窗口控制有三个按钮', await page.locator('.win-ctl').count() === 3);
  await shot('07-win-chrome');

  // Windows 下「全屏」的键位文案跟着变 F11
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(220);
  check('Windows 下「全屏」的键位是 F11',
    (await page.locator('#popMenu [data-menuitem="全屏"] .pop-key').textContent()).trim() === 'F11',
    (await page.locator('#popMenu [data-menuitem="全屏"] .pop-key').textContent()).trim());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  await openConsole('look');
  await page.waitForTimeout(220);

  await page.locator('.seg-item[data-os="mac"]').click();
  await page.waitForTimeout(250);
  check('可切回 macOS 外框', await page.locator('#app').getAttribute('data-os') === 'mac');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* ---------- 15. 浏览器外框细节还原（Chrome / Edge） ---------- */
  check('默认是 Chrome 外框', await page.locator('#app').getAttribute('data-browser') === 'chrome');
  const edgeOnlyInChrome = await page.locator('.chrome-toolbar .edge-only:visible').count();
  check('Chrome 下不显示 Edge 独有按钮', edgeOnlyInChrome === 0, 'n=' + edgeOnlyInChrome);
  check('工具栏图标已注入（后退）',
    await page.locator('.nav-btn[data-nav="back"] svg').count() === 1);
  check('工具栏图标已注入（扩展程序）',
    await page.locator('.chrome-actions [data-pop="ext"] svg').count() === 1);
  check('地址栏站点信息按钮有图标',
    await page.locator('.omni-site svg').count() === 1);
  check('主菜单按钮 tooltip 是 Chrome 文案',
    /Google Chrome/.test(await page.locator('[data-pop="menu"]').getAttribute('title')),
    await page.locator('[data-pop="menu"]').getAttribute('title'));
  const chromeSiteIcon = await page.locator('.omni-site').innerHTML();

  // 星标切换
  await page.locator('.omni-star').click();
  await page.waitForTimeout(200);
  check('点地址栏星标可标记书签',
    await page.locator('.omni-star').getAttribute('data-on') === '1');
  check('标记后星标变成实心',
    /M12 17\.27/.test(await page.locator('.omni-star').innerHTML()));
  await page.locator('.omni-star').click();
  await page.waitForTimeout(150);
  check('再点一次取消书签',
    await page.locator('.omni-star').getAttribute('data-on') === '0');

  // 站点信息面板
  await page.locator('.omni-site').click();
  await page.waitForTimeout(200);
  check('站点信息面板可打开', await page.locator('#popSite').isVisible());
  const siteTxt = await page.locator('#popSite').textContent();
  check('站点信息面板显示「连接是安全的」', /连接是安全的/.test(siteTxt));
  check('站点信息面板回显域名', /chat\.deepseek\.com/.test(siteTxt));
  check('站点信息面板有两条入口',
    await page.locator('#popSite .pop-item').count() === 2);
  await shot('12-pop-site');

  // Esc 必须先吃掉面板，且不影响阅读态（老板键已经换成 Ctrl+D）
  const thinkOpenBefore = await page.locator('.ds-think[data-open="1"]').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 先关闭弹出面板', await page.locator('#popSite').isHidden());
  check('关面板的那次 Esc 不影响阅读态',
    await page.locator('.ds-think[data-open="1"]').count() === thinkOpenBefore,
    `${thinkOpenBefore} -> ${await page.locator('.ds-think[data-open="1"]').count()}`);

  // 扩展程序面板
  await page.locator('[data-pop="ext"]').click();
  await page.waitForTimeout(200);
  check('扩展程序面板可打开', await page.locator('#popExt').isVisible());
  check('扩展程序面板列出全部插件',
    await page.locator('#popExt .pop-ext-row').count() === 6,
    String(await page.locator('#popExt .pop-ext-row').count()));
  const extTxt = await page.locator('#popExt').textContent();
  check('插件清单含常用插件',
    /沉浸式翻译/.test(extTxt) && /Tampermonkey/.test(extTxt));
  check('已固定到工具栏的插件图钉常显',
    await page.locator('#popExt .pop-ext-act.is-on').count() === 2);
  await shot('13-pop-ext');

  // 图钉可按
  await page.locator('#popExt .pop-ext-act').nth(4).click();
  await page.waitForTimeout(150);
  check('点图钉可把插件固定到工具栏',
    await page.locator('#popExt .pop-ext-act.is-on').count() === 3);

  // 个人资料面板
  await page.locator('.chrome-avatar').click();
  await page.waitForTimeout(200);
  check('个人资料面板可打开', await page.locator('#popAvatar').isVisible());
  const avatarTxt = await page.locator('#popAvatar').textContent();
  check('资料面板显示用户名', /陈默/.test(avatarTxt), avatarTxt.slice(0, 24));
  check('资料面板显示邮箱', /chenmo@example\.com/.test(avatarTxt));
  check('默认资料不再带「摸鱼」这类字眼', !/摸/.test(avatarTxt));
  check('资料面板显示同步状态', /同步功能已开启/.test(avatarTxt));
  await shot('14-pop-avatar');

  // 左下角账户行（侧栏）与地址栏头像的默认值：名字与首字母都不该出现「摸」
  check('侧栏左下角默认用户名不是「摸鱼的人」',
    (await page.locator('.ds-account-name').textContent()).trim() === '陈默',
    (await page.locator('.ds-account-name').textContent()).trim());
  check('侧栏头像首字母不是「摸」',
    (await page.locator('.ds-account-avatar').textContent()).trim() === '陈',
    (await page.locator('.ds-account-avatar').textContent()).trim());
  check('地址栏头像按钮也不是「摸」',
    (await page.locator('.chrome-avatar').textContent()).trim() === '陈');

  // 主菜单
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  check('主菜单可打开', await page.locator('#popMenu').isVisible());
  check('主菜单项数正确',
    await page.locator('#popMenu .pop-item').count() === 17,
    String(await page.locator('#popMenu .pop-item').count()));
  const menuTxt = await page.locator('#popMenu').textContent();
  check('主菜单含 Chrome 独有条目',
    /新建隐身窗口/.test(menuTxt) && /删除浏览数据/.test(menuTxt) && /密码和自动填充/.test(menuTxt));
  check('快捷键按 macOS 渲染成 ⌘',
    /^⌘/.test((await page.locator('#popMenu .pop-key').first().textContent()).trim()),
    await page.locator('#popMenu .pop-key').first().textContent());
  await shot('15-pop-menu');

  // 菜单里的「设置」必须映射到应用控制台，而不是死链
  await page.locator('#popMenu [data-menuitem="设置"]').click();
  await page.waitForTimeout(300);
  check('点主菜单「设置」打开应用控制台', await page.locator('#console').isVisible());
  check('点「设置」后主菜单收起', await page.locator('#popMenu').isHidden());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 资料名称实时联动地址栏头像与资料面板
  await openConsole('look');
  await page.locator('#inpProfileName').fill('打工人');
  await page.waitForTimeout(200);
  check('改资料名称后地址栏头像首字母同步',
    (await page.locator('.chrome-avatar').textContent()).trim() === '打',
    (await page.locator('.chrome-avatar').textContent()).trim());
  await page.keyboard.press('Escape');   // 先关控制台，否则遮罩挡住工具栏
  await page.waitForTimeout(250);
  await page.locator('.chrome-avatar').click();
  await page.waitForTimeout(200);
  check('资料面板内容跟着更新',
    /打工人/.test(await page.locator('#popAvatar').textContent()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  /* ---------- 15b. 标签页与登录头像可改 ---------- */
  await openConsole('look');

  check('外观页有标签页标题输入框', await page.locator('#inpTabTitle').isVisible());
  check('外观页有标签页图标预览（跟随皮肤）',
    await page.locator('#faviconPreview img').count() === 1);
  check('外观页有头像预览与底色取色器',
    (await page.locator('#avatarPreview').isVisible()) && (await page.locator('#inpAvatarColor').isVisible()));
  check('外观页有「选择图片 / 恢复首字母」两个按钮',
    (await page.locator('#btnAvatarPick').isVisible()) && (await page.locator('#btnAvatarClear').isVisible()));

  await page.locator('#inpTabTitle').fill('New chat');
  await page.waitForTimeout(250);
  check('改标签页标题后标签栏同步',
    (await page.locator('#tabTitle').textContent()).trim() === 'New chat',
    await page.locator('#tabTitle').textContent());
  check('真实浏览器窗口标题也跟着改',
    (await page.title()).trim() === 'New chat', await page.title());
  await page.locator('#inpTabTitle').fill('');
  await page.waitForTimeout(250);
  check('清空后回落到皮肤自带标题',
    (await page.locator('#tabTitle').textContent()).includes('DeepSeek'),
    await page.locator('#tabTitle').textContent());

  // 头像底色 → 首字母头像
  await page.locator('#inpAvatarColor').evaluate(el => {
    el.value = '#e8710a';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  check('头像预览跟着底色变',
    (await page.locator('#avatarPreview').evaluate(e => getComputedStyle(e).backgroundColor))
      === 'rgb(232, 113, 10)',
    await page.locator('#avatarPreview').evaluate(e => getComputedStyle(e).backgroundColor));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('地址栏头像底色同步',
    (await page.locator('.chrome-avatar').evaluate(e => getComputedStyle(e).backgroundColor))
      === 'rgb(232, 113, 10)');
  check('侧栏账户头像底色同步',
    (await page.locator('.ds-account-avatar').evaluate(e => getComputedStyle(e).backgroundColor))
      === 'rgb(232, 113, 10)');

  // 上传头像图片
  await openConsole('look');
  await page.locator('#avatarFile').setInputFiles(AVATAR_PNG);
  await page.waitForTimeout(500);
  check('上传头像后预览变成图片', await page.locator('#avatarPreview img').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('地址栏头像变成图片', await page.locator('.chrome-avatar img').count() === 1);
  check('侧栏账户头像也跟着变图片', await page.locator('.ds-account-avatar img').count() === 1);

  // 恢复首字母
  await openConsole('look');
  await page.locator('#btnAvatarClear').click();
  await page.waitForTimeout(400);
  check('「恢复首字母」清掉图片头像', await page.locator('#avatarPreview img').count() === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('地址栏头像回到首字母', await page.locator('.chrome-avatar img').count() === 0);

  /* ---------- 15c. 主菜单里的项都有真行为 ---------- */
  // 查找
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  await page.locator('#popMenu [data-menuitem*="查找"]').click();
  await page.waitForTimeout(300);
  check('主菜单「查找…」调出页内查找条', await page.locator('#findBar').isVisible());
  check('查找条贴在内容区上方，不压地址栏',
    await page.evaluate(() => {
      const bar = document.querySelector('#findBar').getBoundingClientRect();
      const tb = document.querySelector('#toolbar').getBoundingClientRect();
      return bar.top >= tb.bottom && bar.top - tb.bottom <= 16;
    }), await page.evaluate(() => {
      const bar = document.querySelector('#findBar').getBoundingClientRect();
      const tb = document.querySelector('#toolbar').getBoundingClientRect();
      return 'find.top=' + Math.round(bar.top) + ' toolbar.bottom=' + Math.round(tb.bottom);
    }));
  check('调出查找条后主菜单收起', await page.locator('#popMenu').isHidden());
  await page.locator('#findInput').fill('潮汐');
  await page.waitForTimeout(350);
  check('查找条显示匹配计数', /^1\/\d+$/.test((await page.locator('#findCount').textContent()).trim()),
    await page.locator('#findCount').textContent());
  await page.locator('#findClose').click();
  await page.waitForTimeout(200);
  check('查找条可关闭', await page.locator('#findBar').isHidden());

  await page.keyboard.press('Control+f');
  await page.waitForTimeout(300);
  check('Ctrl+F 也能调出查找条', await page.locator('#findBar').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc 关闭查找条', await page.locator('#findBar').isHidden());
  check('关查找条的那次 Esc 不影响阅读态',
    await page.locator('.ds-think[data-open="1"]').count() >= 1);

  // 缩放
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  await page.locator('#popMenu [data-menuitem="缩放"]').click();
  await page.waitForTimeout(250);
  check('「缩放」飞出二级菜单', await page.locator('#popFlyout').isVisible());
  check('二级菜单显示当前比例 100%',
    (await page.locator('#popFlyout .pop-zoom-val').textContent()).trim() === '100%',
    await page.locator('#popFlyout .pop-zoom-val').textContent());
  await page.locator('#popFlyout [data-zoom="1"]').click();
  await page.waitForTimeout(300);
  check('点放大后比例变 110%',
    (await page.locator('#popFlyout .pop-zoom-val').textContent()).trim() === '110%',
    await page.locator('#popFlyout .pop-zoom-val').textContent());
  check('视口真的被放大',
    await page.locator('#skinRoot').evaluate(e => e.style.zoom === '1.1'),
    await page.locator('#skinRoot').evaluate(e => e.style.zoom));
  await page.locator('#popFlyout [data-zoom="-1"]').click();
  await page.waitForTimeout(300);
  check('点缩小回到 100%',
    (await page.locator('#popFlyout .pop-zoom-val').textContent()).trim() === '100%');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 收起缩放二级菜单', await page.locator('#popFlyout').isHidden());
  check('缩放被重置后视口不带内联 zoom',
    await page.locator('#skinRoot').evaluate(e => e.style.zoom === ''));

  // 全屏：主菜单「...」里的一级项（真实 Chrome 把它放在系统菜单 / F11，这里给了入口）
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(220);
  const fsRow = page.locator('#popMenu [data-menuitem="全屏"]');
  check('主菜单里有「全屏」', await fsRow.count() === 1);
  check('「全屏」紧跟在「缩放」后面', await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#popMenu [data-menuitem]'))
      .map(e => e.dataset.menuitem);
    return items.indexOf('全屏') === items.indexOf('缩放') + 1;
  }), await page.evaluate(() => Array.from(document.querySelectorAll('#popMenu [data-menuitem]'))
    .map(e => e.dataset.menuitem).join('/')));
  check('「全屏」有图标', await fsRow.locator('.pop-ico svg').count() === 1);
  check('macOS 下「全屏」的键位是 ⌃⌘F',
    (await fsRow.locator('.pop-key').textContent()).trim() === '\u2303\u2318F',
    (await fsRow.locator('.pop-key').textContent()).trim());

  await fsRow.click();
  await page.waitForTimeout(500);
  check('点「全屏」后主菜单收起', await page.locator('#popMenu').isHidden());
  check('真的进了全屏（fullscreenElement 有值）',
    await page.evaluate(() => !!document.fullscreenElement));
  check('全屏时工具栏被藏掉',
    await page.evaluate(() => document.getElementById('toolbar').getBoundingClientRect().height === 0),
    'h=' + await page.evaluate(() => document.getElementById('toolbar').getBoundingClientRect().height));
  check('全屏时标签栏被藏掉',
    await page.evaluate(() => document.getElementById('tabbar').getBoundingClientRect().height === 0));
  await shot('15c-fullscreen');

  await page.evaluate(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { /* 无头环境不给退就当已退 */ }
  });
  await page.waitForTimeout(450);
  check('退出全屏后工具栏回来', await page.locator('#toolbar').isVisible());
  check('退出全屏后 is-fs 被摘掉',
    await page.evaluate(() => !document.getElementById('app').classList.contains('is-fs')));

  // 浏览器同款键位
  await page.keyboard.press('F11');
  await page.waitForTimeout(450);
  check('F11 也能进全屏', await page.evaluate(() => !!document.fullscreenElement));
  await page.keyboard.press('F11');
  await page.waitForTimeout(450);
  check('F11 再按一次退出全屏', await page.evaluate(() => !document.fullscreenElement));

  await page.keyboard.down('Control');
  await page.keyboard.down('Meta');
  await page.keyboard.press('f');
  await page.keyboard.up('Meta');
  await page.keyboard.up('Control');
  await page.waitForTimeout(450);
  check('⌃⌘F 也能进全屏', await page.evaluate(() => !!document.fullscreenElement));
  await page.evaluate(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { /* 同上 */ }
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('Meta');
  await page.keyboard.press('f');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(350);
  check('新键位没抢走 ⌘F 的页内查找', await page.locator('#findBar').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 删除浏览数据
  const chBeforeClear = await page.evaluate(() => NovelFish.api.currentChapter());
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  await page.locator('#popMenu [data-menuitem*="删除浏览数据"]').click();
  await page.waitForTimeout(500);
  check('「删除浏览数据…」后主菜单收起', await page.locator('#popMenu').isHidden());
  check('「删除浏览数据…」重建了会话列表',
    await page.locator('.ds-hist-item').count() >= 10,
    'n=' + await page.locator('.ds-hist-item').count());
  check('清除浏览数据不动阅读进度',
    await page.evaluate(() => NovelFish.api.currentChapter()) === chBeforeClear);

  // 切到 Edge
  const chBeforeEdge = await page.evaluate(() => NovelFish.api.currentChapter());
  await openConsole('look');
  await page.locator('.seg-item[data-browser="edge"]').click();
  await page.waitForTimeout(400);
  check('可切换到 Edge 外框', await page.locator('#app').getAttribute('data-browser') === 'edge');
  check('Edge 下显示主页等独有按钮',
    await page.locator('.chrome-toolbar .edge-only:visible').count() === 5,
    'n=' + await page.locator('.chrome-toolbar .edge-only:visible').count());
  check('Edge 把地址栏图标换成锁',
    await page.locator('.omni-site').innerHTML() !== chromeSiteIcon);
  check('Edge 主菜单 tooltip 变为「设置及其他」',
    await page.locator('[data-pop="menu"]').getAttribute('title') === '设置及其他',
    await page.locator('[data-pop="menu"]').getAttribute('title'));
  check('切换浏览器不丢阅读章节',
    await page.evaluate(() => NovelFish.api.currentChapter()) === chBeforeEdge);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await shot('16-edge');

  // Edge 的主菜单与侧边栏按钮
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  const edgeMenuTxt = await page.locator('#popMenu').textContent();
  check('Edge 主菜单用 Edge 文案',
    /新建 InPrivate 窗口/.test(edgeMenuTxt) && /集锦/.test(edgeMenuTxt),
    edgeMenuTxt.slice(0, 30));
  check('Edge 主菜单里也有「全屏」',
    await page.locator('#popMenu [data-menuitem="全屏"]').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const sideBefore = await page.locator('.ds').getAttribute('data-side');
  await page.locator('[data-edge="sidebar"]').click();
  await page.waitForTimeout(400);
  check('Edge 侧边栏按钮联动左侧对话列表',
    await page.locator('.ds').getAttribute('data-side') !== sideBefore,
    `${sideBefore} -> ${await page.locator('.ds').getAttribute('data-side')}`);
  await page.locator('[data-edge="sidebar"]').click();
  await page.waitForTimeout(300);

  // 切回 Chrome
  await openConsole('look');
  await page.locator('.seg-item[data-browser="chrome"]').click();
  await page.waitForTimeout(350);
  check('可切回 Chrome 外框', await page.locator('#app').getAttribute('data-browser') === 'chrome');
  check('切回 Chrome 后 Edge 按钮重新隐藏',
    await page.locator('.chrome-toolbar .edge-only:visible').count() === 0);
  check('切回 Chrome 后地址栏图标还原',
    await page.locator('.omni-site').innerHTML() === chromeSiteIcon);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* ---------- 16b. 关掉浏览器外框：只剩网站内容 ----------
     外框一关，工具栏和地址栏一起消失 —— 控制台那排按钮也就点不到了，
     所以这里除了「关掉之后干净」之外，还要验证「怎么回来」。 */
  await openConsole('look');
  check('外观面板里有「显示浏览器外框」开关，默认是开的',
    await page.locator('#swChrome').getAttribute('aria-checked') === 'true');
  await page.locator('#swChrome').click();
  await page.waitForTimeout(400);
  check('关掉后 #app 进入 bare 外壳',
    await page.locator('#app').getAttribute('data-shell') === 'bare');
  check('关掉后开关自己同步成关',
    await page.locator('#swChrome').getAttribute('aria-checked') === 'false');
  check('关掉时给出「怎么回来」的提示（工具栏已经没了）',
    /再按 T 显示/.test(await page.locator('#toastWrap').textContent()),
    (await page.locator('#toastWrap').textContent()).trim());

  const bare = await page.evaluate(() => {
    const box = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const frame = document.querySelector('.chrome');
    return {
      frame: box('.chrome'), viewport: box('#skinRoot'),
      tabbar: getComputedStyle(document.querySelector('.chrome-tabbar')).display,
      toolbar: getComputedStyle(document.querySelector('.chrome-toolbar')).display,
      radius: getComputedStyle(frame).borderRadius,
      shadow: getComputedStyle(frame).boxShadow,
      vw: window.innerWidth, vh: window.innerHeight
    };
  });
  check('bare 下外框壳铺满整个视口、圆角与投影都归零（不是缩在中间的小窗口）',
    bare.frame[0] === 0 && bare.frame[1] === 0 &&
    bare.frame[2] === bare.vw && bare.frame[3] === bare.vh &&
    bare.radius === '0px' && bare.shadow === 'none',
    bare.frame.join(',') + ' 视口=' + bare.vw + '×' + bare.vh +
    ' r=' + bare.radius + ' shadow=' + bare.shadow);
  check('bare 下标签栏与工具栏彻底不占位',
    bare.tabbar === 'none' && bare.toolbar === 'none',
    bare.tabbar + ' / ' + bare.toolbar);
  check('bare 下网站内容正好占满视口（DeepSeek 页与视口 1:1）',
    bare.viewport[2] === bare.vw && bare.viewport[3] === bare.vh,
    bare.viewport.join(',') + ' 视口=' + bare.vw + '×' + bare.vh);
  await shot('16b-bare');

  // 回来：先把控制台收起、焦点交回页面，再按 T
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  check('bare 下 T 键能把外框叫回来',
    await page.locator('#app').getAttribute('data-shell') === 'chrome');
  check('外框回来后标签栏与工具栏都在',
    await page.locator('#tabbar').isVisible() && await page.locator('#toolbar').isVisible());
  check('外框回来后开关同步成开',
    await page.locator('#swChrome').getAttribute('aria-checked') === 'true');

  // 再关一次，验证「没有外框也打得开控制台」—— 这是关掉之后唯一的自救入口
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  check('再按一次 T 又能关掉', await page.locator('#app').getAttribute('data-shell') === 'bare');
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(350);
  check('bare 下仍能打开控制台', await page.locator('#console').isVisible());
  await page.locator('#consoleClose').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  check('收尾回到有外框的常态',
    await page.locator('#app').getAttribute('data-shell') === 'chrome');

  /* ---------- 17. 截图：macOS 外框下的完整体 ---------- */
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(250);
  await shot('08-panic-mac');
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(350);

  /* ---------- 18. 新建对话 → 欢迎页 ---------- */
  await page.locator('.ds-newchat').click();
  await page.waitForTimeout(400);
  check('新建对话进入欢迎页', await page.locator('.ds-stage.is-welcome').count() === 1);
  check('欢迎页显示「欢迎回来，随时开始吧」',
    (await page.locator('.ds-welcome-title').textContent()).includes('欢迎回来'));
  check('欢迎页没有消息', await page.locator('.ds-ai-msg').count() === 0);
  check('欢迎页不显示顶部冻结条', await page.locator('.ds-think-head').count() === 0);
  /* 官网首页（b2）：._660ca72 是 inset:0 的绝对层，._9a2f8e4 居中列 840 / padding 0 32px 64px，
     欢迎块和输入框一起居中，且**不渲染**免责声明（bX 只在对话页的吸底容器 b0 里）。 */
  const homeGeo = await page.evaluate(() => {
    const r = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
    return {
      stage: r('.ds-stage'), welcome: r('.ds-welcome'), title: r('.ds-welcome-title'),
      mark: r('.ds-welcome-mark'), box: r('.ds-box'), composer: r('.ds-composer'),
      stagePos: cs('.ds-stage', 'position'),
      stagePad: cs('.ds-stage', 'padding'),
      titleFont: cs('.ds-welcome-title', 'fontSize') + '/' + cs('.ds-welcome-title', 'lineHeight') +
                 '/' + cs('.ds-welcome-title', 'fontWeight'),
      markMargin: cs('.ds-welcome-mark', 'marginRight'),
      disclaimerVisible: !!document.querySelector('.ds-disclaimer') &&
        document.querySelector('.ds-disclaimer').getClientRects().length > 0,
      topVisible: r('.ds-top') !== null && document.querySelector('.ds-top').getClientRects().length > 0,
      ds: r('.ds')
    };
  });
  check('欢迎页是覆盖整块主区的居中层（官网 ._660ca72 / ._9a2f8e4）',
    homeGeo.stagePos === 'absolute' && homeGeo.stagePad === '0px 32px 64px' &&
    homeGeo.stage[3] === homeGeo.ds[3] && homeGeo.stage[2] === homeGeo.ds[2] - 261,
    homeGeo.stagePos + ' ' + homeGeo.stagePad + ' stage=' + homeGeo.stage.join(',') +
    ' ds=' + homeGeo.ds.join(','));
  check('欢迎块和输入框同栏 776px、左缘对齐（840 − 2×32）',
    homeGeo.welcome[0] === homeGeo.box[0] && homeGeo.welcome[2] === 776 &&
    homeGeo.box[2] === 776,
    homeGeo.welcome.join(',') + ' / ' + homeGeo.box.join(','));
  check('欢迎语 24px/32px/600、鲸鱼 34×25 右距 10px（官网 ._6c7e7df / .ce41ed1b）',
    homeGeo.titleFont === '24px/32px/600' &&
    homeGeo.mark[2] === 34 && homeGeo.mark[3] === 25 && homeGeo.markMargin === '10px',
    homeGeo.titleFont + ' mark=' + homeGeo.mark.join(',') + ' mr=' + homeGeo.markMargin);
  check('欢迎页不显示免责声明（官网首页不渲染 bX）',
    homeGeo.disclaimerVisible === false);
  check('欢迎页顶栏仍在，且浮在居中层之上（官网 .the-header 透明浮层）',
    homeGeo.topVisible === true);
  check('欢迎页的输入框换成官网新会话态的大范围柔光',
    await page.locator('.ds-box').evaluate(e => {
      const s = getComputedStyle(e).boxShadow;
      return /rgba\(0, 0, 0, 0\.02\) 0px 4px 12px/.test(s) && /rgba\(72, 104, 178, 0\.03\) 0px 30px 60px/.test(s);
    }), await page.locator('.ds-box').evaluate(e => getComputedStyle(e).boxShadow));
  await shot('09-welcome');

  // 同样带上阅读触发词 —— 新会话这一路也只测「发出去了、落到正文了」
  await page.locator('.ds-input').fill('帮我评审一段系统设计，接着读');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(400);
  check('新对话发送后进入正文', await page.locator('.ds-stage.is-welcome').count() === 0);
  check('新对话只有一组问答', await page.locator('.ds-ai-msg').count() === 1);
  check('新对话标题改成提问内容',
    (await page.locator('.ds-top-title').textContent()).includes('评审'),
    await page.locator('.ds-top-title').textContent());
  check('新对话出现在列表最前',
    (await page.locator('.ds-hist-item').first().textContent()).includes('评审'));
  check('新对话里正文可读',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 2);
  await settle();

  /* ---------- 19. 皮肤热切换（插件可插拔） ---------- */
  const chBeforeSwitch = await page.evaluate(() => NovelFish.store.state.progress.chapter);
  await openConsole('skin');
  await page.locator('.skin-card[data-skin="gpt"]').click();
  await page.waitForTimeout(800);
  check('切换到 GPT 皮肤', await page.locator('.gpt').count() === 1);
  check('切换后地址栏同步', (await page.locator('#omniUrl').textContent()) === 'chatgpt.com');
  check('切换后标签页标题同步', (await page.locator('#tabTitle').textContent()) === 'ChatGPT');
  check('GPT 皮肤里同样渲染了正文', (await page.locator('.gpt-think .nf-p').count()) > 3);
  check('GPT 皮肤里伪装回答正常',
    ((await page.locator('.gpt-answer').first().textContent()) || '').length > 60);
  check('GPT 皮肤无残留 DeepSeek 节点', await page.locator('.ds').count() === 0);
  await shot('10-gpt');

  await page.keyboard.press('Control+d');
  await page.waitForTimeout(250);
  check('GPT 皮肤下老板键可用', await page.locator('.gpt-msg[data-open="1"]').count() === 0);
  await page.locator('.gpt-think-head').last().click();
  await page.waitForTimeout(300);
  check('GPT 皮肤点思考头可恢复阅读态',
    await page.locator('.gpt-msg[data-open="1"]').count() === 1);

  await page.locator('.gpt-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.skin-card[data-skin="deepseek"]').click();
  await page.waitForTimeout(800);
  check('切回 DeepSeek 皮肤', await page.locator('.ds').count() === 1);
  check('切换皮肤后阅读章节不丢',
    await page.evaluate(() => NovelFish.store.state.progress.chapter) === chBeforeSwitch);

  /* ---------- 20. 刷新后恢复 ---------- */
  const convTitleBeforeReload = await page.locator('.ds-top-title').textContent();
  const msgBeforeReload = await page.locator('.ds-ai-msg').count();
  await page.locator('.ds-thread').evaluate(e => {
    const b = e.querySelector('.ds-ai-msg:last-child .ds-think-body');
    const top = b.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop;
    e.scrollTop = top + 300;
  });
  await page.waitForTimeout(450);
  const savedTop = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  const savedOff = await page.evaluate(() => NovelFish.store.state.progress.feedOffset);
  const savedDiag = await page.evaluate(() => {
    const e = document.querySelector('.ds-thread');
    const bd = e.querySelector('.ds-ai-msg:last-child .ds-think-body');
    return {
      h: e.scrollHeight, client: e.clientHeight,
      bodyTop: Math.round(bd.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop),
      ai: document.querySelectorAll('.ds-ai-msg').length,
      secs: e.querySelectorAll('.ds-ai-msg:last-child .nf-sec').length
    };
  });
  check('阅读偏移已记录（相对正文容器）',
    typeof savedOff === 'number' && Math.abs(savedOff - 300) < 24, 'off=' + savedOff + ' | ' + JSON.stringify(savedDiag));

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds-think-body .nf-p');
  await page.waitForTimeout(700);
  const restoredTop = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  const reloadDiag = await page.evaluate(() => {
    const e = document.querySelector('.ds-thread');
    const bd = e.querySelector('.ds-ai-msg:last-child .ds-think-body');
    return {
      h: e.scrollHeight, client: e.clientHeight,
      bodyTop: Math.round(bd.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop),
      off: NovelFish.store.state.progress.feedOffset,
      ch: NovelFish.store.state.progress.chapter,
      thru: NovelFish.store.state.progress.loadedThrough
    };
  });
  check('刷新后恢复滚动位置', Math.abs(restoredTop - savedTop) < 90,
    `${savedTop} -> ${restoredTop} | 刷新后 ` + JSON.stringify(reloadDiag));
  const restoredOff = await page.evaluate(() => NovelFish.store.state.progress.feedOffset);
  check('刷新后相对偏移一致', Math.abs(restoredOff - savedOff) < 24, `${savedOff} -> ${restoredOff}`);
  check('刷新后恢复对话条数',
    await page.locator('.ds-ai-msg').count() === msgBeforeReload);
  check('刷新后仍停在同一会话',
    (await page.locator('.ds-top-title').textContent()) === convTitleBeforeReload);
  check('刷新后仍保持 macOS 外框',
    await page.locator('#app').getAttribute('data-os') === 'mac');
  check('刷新后不再冒「小说在深度思考里」这类一次性提示',
    !/深度思考里/.test(await page.locator('#toastWrap').textContent()),
    (await page.locator('#toastWrap').textContent()).trim());
  await shot('11-after-reload');

  /* ---------- 21. file:// 直接双击打开 ---------- */
  const fileErr = [];
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => fileErr.push('pageerror: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') fileErr.push('console: ' + m.text()); });
  await p2.goto(FILE_URL, { waitUntil: 'load' });
  await p2.waitForTimeout(900);
  const fileState = await p2.evaluate(() => ({
    skin: !!document.querySelector('.ds'),
    freezeBar: !!document.querySelector('.ds-think-head'),
    noReadOnly: !document.querySelector('.ds-fold-all') && !document.querySelector('.ds-sticky'),
    convs: document.querySelectorAll('.ds-hist-item').length,
    readerCss: [...document.styleSheets].some(s => (s.href || '').includes('reader.css')),
    font: getComputedStyle(document.documentElement).getPropertyValue('--nf-font').trim(),
    chapters: NovelFish.novel.chapterCount()
  }));
  check('file:// 下皮肤正常挂载', fileState.skin);
  check('file:// 下存在冻结吸顶条', fileState.freezeBar);
  check('file:// 下没有净读残留', fileState.noReadOnly);
  check('file:// 下对话列表已生成', fileState.convs >= 10, 'n=' + fileState.convs);
  check('file:// 下 reader.css 已加载', fileState.readerCss);
  check('file:// 下阅读变量已注入', fileState.font === '14px', fileState.font);
  check('file:// 下无控制台错误', fileErr.length === 0, fileErr.join(' | '));
  await p2.close();

  /* ---------- 22. EPUB 导入 ---------- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds', { timeout: 5000 });
  await page.waitForTimeout(700);

  await openConsole('book');
  check('书架页写明支持 EPUB', /epub/i.test(await page.locator('#dropzone').textContent()));
  check('文件选择框放开 .epub',
    ((await page.locator('#fileInput').getAttribute('accept')) || '').includes('.epub'));

  // EPUB3：nav 目录分章；spine 里的目录页与封面残页应被排掉；一章两个 h2 应切成两章
  await page.locator('#fileInput').setInputFiles(EPUB_V3);
  await page.waitForTimeout(1600);
  const ep3 = await page.evaluate(() => ({
    title: NovelFish.store.state.novel.title,
    stored: Array.isArray(NovelFish.store.state.novel.chapters)
      ? NovelFish.store.state.novel.chapters.length : -1,
    count: NovelFish.novel.chapterCount(),
    titles: NovelFish.novel.toc().map(c => c.title),
    headTitle: (document.getElementById('bookTitle').textContent || '').trim(),
    listItems: document.querySelectorAll('#chapterList .chapter-item').length,
    firstPara: (document.querySelector('.nf-p') || {}).textContent || '',
    toast: (document.getElementById('toastWrap').textContent || '').trim()
  }));
  check('EPUB 书名取自 dc:title', ep3.title === '山海拾遗', ep3.title);
  check('EPUB 分章数正确（目录页与封面已排掉、一章两节已拆开）',
    ep3.count === 5, String(ep3.count) + ' -> ' + ep3.titles.join(' | '));
  check('章节名来自书内 nav 目录',
    ep3.titles[0] === '第一章 落霞' && ep3.titles[3] === '第三章 夜航',
    ep3.titles.join(' | '));
  check('一章拆两节时用正文小标题',
    ep3.titles[1] === '第二章 潮信' && ep3.titles[2] === '潮信·补遗',
    ep3.titles.join(' | '));
  check('正文标题优先于 nav 名',
    ep3.titles[4] === '归墟（下）', ep3.titles[4]);
  check('EPUB 正文进了「深度思考」框', ep3.firstPara.length > 20, ep3.firstPara.slice(0, 16));
  check('控制台书目与章节列表同步刷新',
    ep3.headTitle.includes('山海拾遗') && ep3.listItems === 5,
    ep3.headTitle + ' / ' + ep3.listItems);
  check('导入后给了明确回执', /已载入《山海拾遗》共 5 章/.test(ep3.toast), ep3.toast);
  await shot('20-epub');

  // 章节名落盘 → 刷新后不该重新解析压缩包
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds-think-body .nf-p', { timeout: 5000 });
  await page.waitForTimeout(600);
  const ep3r = await page.evaluate(() => ({
    title: NovelFish.store.state.novel.title,
    count: NovelFish.novel.chapterCount(),
    text: NovelFish.store.state.novel.text
  }));
  check('刷新后 EPUB 从已切好的章节恢复', ep3r.title === '山海拾遗' && ep3r.count === 5,
    ep3r.title + ' / ' + ep3r.count);
  check('刷新后不再重复保存整本纯文本', !ep3r.text);

  // EPUB2：没有 nav，章节名只能来自 NCX
  // （文件选择框本身是隐藏的，直接 setInputFiles，不必再开一次控制台）
  await page.locator('#fileInput').setInputFiles(EPUB_NCX);
  await page.waitForTimeout(1400);
  const ep2 = await page.evaluate(() => ({
    title: NovelFish.store.state.novel.title,
    count: NovelFish.novel.chapterCount(),
    titles: NovelFish.novel.toc().map(c => c.title)
  }));
  check('EPUB2 书名正确', ep2.title === '旧航日志', ep2.title);
  check('EPUB2 章节名取自 NCX', ep2.count === 2 && ep2.titles[0] === '卷一 起锚' &&
    ep2.titles[1] === '卷二 锚地', ep2.count + ' -> ' + ep2.titles.join(' | '));

  // 坏文件：扩展名是 epub 却不是压缩包 → 给出提示且不动当前书
  await page.locator('#fileInput').setInputFiles(FAKE_EPUB);
  await page.waitForTimeout(900);
  const bad = await page.evaluate(() => ({
    toast: (document.getElementById('toastWrap').textContent || '').trim(),
    title: NovelFish.store.state.novel.title,
    count: NovelFish.novel.chapterCount()
  }));
  check('坏 EPUB 有明确失败提示', /EPUB 解析失败/.test(bad.toast), bad.toast);
  check('坏 EPUB 不影响正在读的书', bad.title === '旧航日志' && bad.count === 2,
    bad.title + ' / ' + bad.count);
  check('EPUB 解析全程无页面错误', errors.length === 0, errors.join(' | '));

  /* ---------- 23. 分享「深度思考」里的这本小说 ---------- */
  // 1) 小而完整的书：链接自包含，换台机器也能读
  await page.locator('#fileInput').setInputFiles(SHARE_TXT);
  await page.waitForTimeout(1000);
  check('分享用例的书已载入', (await page.evaluate(() => NovelFish.store.state.novel.title)) === '潮汐拾遗',
    await page.evaluate(() => NovelFish.store.state.novel.title));

  await page.locator('.ds-share-btn').last().click();
  await page.waitForTimeout(250);
  await page.locator('.ds-modal-actions .ds-btn--primary').last().click();
  await page.waitForTimeout(500);
  const novelLink = (await page.locator('.ds-modal-content .ds-linkbox span').last().textContent()) || '';
  const novelPayload = novelLink.split('#nf=')[1] || '';
  check('小说的链接把整本书带走', /^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9]{18}#nf=1z/.test(novelLink),
    novelLink.slice(0, 60) + ' (' + novelLink.length + ' 字符)');
  check('载荷能从链接原样解回来', await page.evaluate(async (u) => {
    const b = await NovelFish.share.unpack(NovelFish.share.parse(u));
    return !!b && b.title === '潮汐拾遗' && b.chapters.length === 3 &&
      b.chapters[2].paras[1].includes('指甲刮掉');
  }, novelLink));
  await shot('30-share-novel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // 2) 收起「深度思考」时，链接退回官网那张空链接 —— 别的部分不许走样
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(600);
  check('收起后思考框已折叠',
    await page.locator('.ds-think').last().getAttribute('data-open') === '0');
  await page.locator('.ds-share-btn').last().click();
  await page.waitForTimeout(250);
  await page.locator('.ds-modal-actions .ds-btn--primary').last().click();
  await page.waitForTimeout(450);
  const plainLink = (await page.locator('.ds-modal-content .ds-linkbox span').last().textContent()) || '';
  check('小说不在屏幕上时，链接与官网完全同形',
    /^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9]{18}$/.test(plainLink), plainLink);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(600);

  // 3) 换一本书，再把链接粘回窗口：那本书应该原样回来
  await page.locator('#fileInput').setInputFiles(OTHER_TXT);
  await page.waitForTimeout(1000);
  check('换书成功（书名已变）',
    (await page.evaluate(() => NovelFish.store.state.novel.title)) === '靠岸记',
    await page.evaluate(() => NovelFish.store.state.novel.title));

  await page.evaluate((url) => {
    const dt = new DataTransfer();
    dt.setData('text', url);
    document.body.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true
    }));
  }, novelLink);
  await page.waitForTimeout(1200);
  const pastedBack = await page.evaluate(() => {
    const thinks = document.querySelectorAll('.ds-think');
    return {
      title: NovelFish.store.state.novel.title,
      count: NovelFish.novel.chapterCount(),
      open: thinks[thinks.length - 1].dataset.open,
      first: (document.querySelector('.nf-p') || {}).textContent || ''
    };
  });
  check('把链接粘回窗口即还原那本书',
    pastedBack.title === '潮汐拾遗' && pastedBack.count === 3, JSON.stringify(pastedBack));
  check('还原后「深度思考」自动展开且正文就位',
    pastedBack.open === '1' && pastedBack.first.includes('灯芯第三次熄灭'),
    pastedBack.open + ' / ' + pastedBack.first.slice(0, 14));

  // 4) 等价路径：地址栏带 fragment 直接打开（换个标签页，等于把链接发给另一台机器）
  const p4 = await ctx.newPage();
  const p4err = [];
  p4.on('pageerror', e => p4err.push('pageerror: ' + e.message));
  p4.on('console', m => { if (m.type() === 'error') p4err.push('console: ' + m.text()); });
  await p4.goto(BASE + '/#nf=' + novelPayload, { waitUntil: 'load' });
  await p4.waitForSelector('.ds-think-body .nf-p', { timeout: 8000 });
  await p4.waitForTimeout(600);
  const received = await p4.evaluate(() => ({
    title: NovelFish.store.state.novel.title,
    count: NovelFish.novel.chapterCount(),
    first: (document.querySelector('.nf-p') || {}).textContent || '',
    hash: location.hash,
    toast: (document.getElementById('toastWrap').textContent || '').trim()
  }));
  check('带 fragment 打开即装好分享副本',
    received.title === '潮汐拾遗' && received.count === 3,
    received.title + ' / ' + received.count);
  check('分享副本的正文进了「深度思考」框', received.first.includes('灯芯第三次熄灭'),
    received.first.slice(0, 14));
  check('收下之后把载荷从地址栏抹掉（否则刷新就重装一遍）', received.hash === '', received.hash);
  check('接收全程无页面错误', p4err.length === 0, p4err.join(' | '));
  await p4.screenshot({ path: SHOT + '/31-share-received.png' });
  await p4.close();

  // 5) 百万字级长篇：编不进链接，改为落一份分享副本文件
  await page.locator('#fileInput').setInputFiles(BIG_TXT);
  await page.waitForTimeout(2600);
  const bigBook = await page.evaluate(() => ({
    chars: NovelFish.novel.totalChars(),
    chapters: NovelFish.novel.chapterCount()
  }));
  check('压力样本已载入（百万字级）', bigBook.chars > 900000, JSON.stringify(bigBook));
  check('百万字长篇编不进链接',
    (await page.evaluate(async () => (await NovelFish.share.pack(NovelFish.api.doc)) === null)));

  const dl = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('.ds-share-btn').last().click();
  await page.waitForTimeout(300);
  await page.locator('.ds-modal-actions .ds-btn--primary').last().click();
  const download = await dl;
  await page.waitForTimeout(500);
  const bigLink = (await page.locator('.ds-modal-content .ds-linkbox span').last().textContent()) || '';
  check('超长书：链接退回官网形状（不给一条打不开的巨长 URL）',
    /^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9]{18}$/.test(bigLink), bigLink);
  check('超长书：另存为分享副本文件',
    /-分享副本\.txt$/.test(download.suggestedFilename()), download.suggestedFilename());
  const dlPath = path.join(os.tmpdir(), 'nf-dl-' + process.pid + '.txt');
  await download.saveAs(dlPath);
  const dlText = fs.readFileSync(dlPath, 'utf8');
  check('分享副本文件带书名与章节结构',
    /^《nf-big-\d+》\n\n第 1 章\n/.test(dlText.slice(0, 60)), JSON.stringify(dlText.slice(0, 30)));
  check('分享副本文件是完整的（末尾章节都在）',
    dlText.length > 900000 && dlText.slice(-20000).includes('第 120 章'),
    dlText.length + ' 字 / 尾部: ' + JSON.stringify(dlText.slice(-40)));
  fs.unlinkSync(dlPath);
  check('分享全程无页面错误', errors.length === 0, errors.join(' | '));

  /* ---------- 24. 打字提问：触发词分流 / 真实模型对话 ---------- */
  // 换回一本小书，这一段只关心对话本身
  await page.locator('#fileInput').setInputFiles(SHARE_TXT);
  await page.waitForTimeout(900);
  await page.waitForTimeout(300);

  check('默认不带任何模型服务',
    await page.evaluate(() => NovelFish.api.model.list().length) === 0);

  // 没配模型：不含触发词的提问会被**明确退回**，输入还回输入框。
  // 这里不偷偷退回剧本 —— 那会让人以为问到了模型，其实拿到的是别人的稿子。
  const noModelBefore = await page.evaluate(() => NovelFish.chat.exchanges.length);
  const askNoModel = '这段代码的边界条件写对了吗';
  await page.locator('.ds-input').fill(askNoModel);
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(500);
  const noModelAfter = await page.evaluate(() => NovelFish.chat.exchanges.length);
  check('没有模型服务时，不含触发词的提问不会被伪装成「模型答的」',
    noModelAfter === noModelBefore, `${noModelBefore} -> ${noModelAfter}`);
  check('没配模型时给出明确提示，而不是静默无响应',
    /还没有配置模型服务/.test(await page.locator('#toastWrap').textContent()),
    (await page.locator('#toastWrap').textContent()).trim());
  check('被退回的输入原样留在输入框里（不吞掉人打的那一句）',
    (await page.locator('.ds-input').inputValue()) === askNoModel,
    await page.locator('.ds-input').inputValue());
  await page.locator('.ds-input').fill('');
  await page.waitForTimeout(150);

  /* ---- 在「模型」面板里配一条服务（顺便验面板本身可用） ---- */
  await openConsole('model');
  check('模型面板初始是空态', await page.locator('#svcList .svc-empty').count() === 1);
  check('模型面板有服务商预设',
    await page.locator('#svcPreset option').count() >= 6,
    String(await page.locator('#svcPreset option').count()));

  await page.locator('#btnSvcAdd').click();
  await page.locator('#svcPreset').selectOption('deepseek');
  const presetFill = await page.evaluate(() => ({
    base: document.getElementById('svcBase').value,
    model: document.getElementById('svcModel').value
  }));
  check('选预设会自动填好接口地址与模型名',
    presetFill.base === 'https://api.deepseek.com/v1' && presetFill.model === 'deepseek-chat',
    JSON.stringify(presetFill));
  await shot('40-model-pane');

  await page.locator('#svcName').fill('本地假模型');
  await page.locator('#svcBase').fill('http://127.0.0.1:' + MOCK_PORT + '/v1');
  await page.locator('#svcKey').fill('sk-mock-123');
  await page.locator('#svcModel').fill('deepseek-reasoner');
  await page.locator('#svcExtra').fill('{"reasoning_effort":"high"}');
  await page.locator('#btnSvcSave').click();
  await page.waitForTimeout(350);
  check('保存后列表里出现这条服务', await page.locator('#svcList .svc-item').count() === 1);
  check('新保存的服务被标成使用中',
    await page.locator('#svcList .svc-item .skin-tag').count() === 1);
  check('服务成为当前生效的一条',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).model) === 'deepseek-reasoner');

  await page.locator('#btnSvcTest').click();
  await page.waitForTimeout(1600);
  check('「测试连接」给出成功回执',
    /连接正常/.test(await page.locator('#toastWrap').textContent()),
    (await page.locator('#toastWrap').textContent()).trim());
  await page.locator('#consoleClose').click();
  await page.waitForTimeout(250);

  /* ---- 不含触发词 → 走真实模型，思考是模型的真实推理 ---- */
  mock.reset();
  await page.locator('.ds-input').fill('讲讲排序算法的稳定性');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(330);
  const stream1 = await turnView();
  check('真实对话：表头先显示「正在思考」', stream1.label === '正在思考', stream1.label);
  check('真实对话：思考进行中带流式态', stream1.streaming);
  check('真实对话：思考框里是推理文本而不是小说',
    stream1.thinkLen > 4 && stream1.thinkLen < mockMod.REASONING.length && !stream1.hasNovel,
    'thinkLen=' + stream1.thinkLen + ' novel=' + stream1.hasNovel);

  await page.waitForTimeout(320);
  const stream2 = await turnView();
  check('思考是逐字流出来的（后一帧更长）',
    stream2.thinkLen > stream1.thinkLen, stream1.thinkLen + ' -> ' + stream2.thinkLen);

  await settle();
  const modelDone = await turnView();
  check('这一条落成「模型模式」', modelDone.storeMode === 'model', modelDone.storeMode);
  check('深度思考里是模型给的原文',
    modelDone.storeReasoning === mockMod.REASONING && modelDone.thinkLen === mockMod.REASONING.length,
    modelDone.storeReasoning.slice(0, 20) + '(' + modelDone.thinkLen + ')');
  check('回答是模型给的原文',
    modelDone.storeAnswer.startsWith(mockMod.ANSWER.slice(0, 24)),
    modelDone.storeAnswer.slice(0, 24));
  check('回答完整渲染到了气泡里',
    modelDone.answerLen >= mockMod.ANSWER.length, modelDone.answerLen + '/' + mockMod.ANSWER.length);
  check('表头落定成带真实用时的文案',
    /^已思考（用时 \d+ 秒）$/.test(modelDone.label), modelDone.label);
  check('模型模式下「深度思考」默认就是展开的', modelDone.thinkOpen === '1');
  check('模型模式下思考框里没有小说', !modelDone.hasNovel);
  await shot('41-model-stream');

  check('这一轮确实打到了一次模型', mock.calls.length === 1, String(mock.calls.length));
  const req1 = mock.calls[0].body;
  check('请求带上了 Key 与模型名',
    /Bearer sk-mock-123/.test(mock.calls[0].auth) && req1.model === 'deepseek-reasoner',
    mock.calls[0].auth + ' / ' + req1.model);
  check('请求开了流式', req1.stream === true);
  check('服务里的额外参数合进了请求体', req1.reasoning_effort === 'high',
    JSON.stringify(req1.reasoning_effort));
  check('把之前的对话当成上下文一起发了过去',
    (req1.messages || []).length >= 3, String((req1.messages || []).length));
  check('上下文里最后一条就是这次提问',
    req1.messages[req1.messages.length - 1].content === '讲讲排序算法的稳定性');

  /* ---- 含触发词 → 走剧本，思考里是小说的原文，且不打模型 ---- */
  mock.reset();
  await page.locator('.ds-input').fill('继续');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(380);
  const trigMid = await turnView();
  check('命中触发词：表头也是「正在思考」（外观上与真实对话无异）',
    trigMid.label === '正在思考', trigMid.label);
  // SHARE_TXT 这本小书每章只有 2 段，别拿大书的段数当阈值
  check('命中触发词：思考框里立刻挂上小说', trigMid.hasNovel && trigMid.paras >= 2,
    String(trigMid.paras));

  await settle();
  const trigDone = await turnView();
  check('命中触发词的这条落成剧本模式', trigDone.storeMode === 'novel', trigDone.storeMode);
  check('剧本模式有「用时」，表头同样落定',
    /^已思考（用时 \d+ 秒）$/.test(trigDone.label), trigDone.label);
  check('回答取自剧本而不是模型',
    !trigDone.storeAnswer.includes('收到') && trigDone.storeAnswer.length > 10,
    trigDone.storeAnswer.slice(0, 18));
  check('命中的提问一次都没有发给模型', mock.calls.length === 0, String(mock.calls.length));
  check('触发词原样成为提问气泡',
    (await page.locator('.ds-bubble').last().textContent()).trim() === '继续');

  /* ---- 自建剧本：名称 / 话题 / 专属触发词 / 深度思考默认开合 ---- */
  await openConsole('mask');
  const scriptCountBefore = await page.locator('#selScript option').count();
  await page.locator('#btnScriptNew').click();
  await page.locator('#seName').fill('运维播报');
  await page.locator('#seTopic').fill('值班');
  await page.locator('#seTriggers').fill('看板, 巡检');
  await page.locator('#seThink').click();          // 关掉「默认展开」
  await page.locator('#sePairs').fill(
    'Q: 今天看板正常吗\nA: 正常，没有告警。\n\nQ: 巡检跑完了吗\nA: 跑完了，结果已归档。');
  await page.locator('#btnScriptSave').click();
  await page.waitForTimeout(350);
  check('自建剧本落盘了',
    await page.evaluate(() => (NovelFish.store.state.mask.customScripts || []).length) === 1);
  check('自建剧本出现在剧本下拉里',
    await page.locator('#selScript option').count() === scriptCountBefore + 1);
  check('保存后自动切到新剧本',
    await page.evaluate(() => NovelFish.store.state.mask.script).then(
      id => page.evaluate((x) => {
        const list = NovelFish.camouflage.scripts;
        return list[list.length - 1].id === x;
      }, id)));
  check('自建剧本的专属触发词已生效',
    await page.evaluate(() => NovelFish.api.scripts.match('帮我看板')) === '看板');
  check('全局阅读触发词仍然生效',
    await page.evaluate(() => NovelFish.api.scripts.match('我们继续吧')) === '继续');
  const trigInput = await page.locator('#inpTriggers').inputValue();
  check('触发词输入框显示的是真实配置', /继续/.test(trigInput), trigInput);
  await shot('42-script-editor');
  await page.locator('#consoleClose').click();
  await page.waitForTimeout(250);

  mock.reset();
  await page.locator('.ds-input').fill('帮我看板');
  await page.locator('.ds-input').press('Enter');
  await settle();
  const custom = await turnView();
  check('专属触发词命中自建剧本',
    await page.evaluate(() => {
      const list = NovelFish.chat.exchanges;
      const id = list[list.length - 1].scriptId;
      return NovelFish.camouflage.raw.some(s => s.id === id && s.custom);
    }));
  // 自建剧本里写了两组，取哪一组由全局轮换游标决定 —— 两句话都对
  check('回答就是自建剧本里写的那句',
    ['正常，没有告警。', '跑完了，结果已归档。'].includes(custom.storeAnswer),
    custom.storeAnswer);
  check('自建剧本可以让「深度思考」默认收起', custom.thinkOpen === '0', String(custom.thinkOpen));
  check('收起时正文仍在 DOM 里（点开即读）', custom.hasNovel && custom.paras >= 2,
    String(custom.paras));
  check('配了模型也不会截走触发词提问', mock.calls.length === 0, String(mock.calls.length));

  // 删掉自建剧本，别影响后面的用例
  await openConsole('mask');
  await page.locator('#btnScriptDel').click();
  await page.waitForTimeout(300);
  check('自建剧本可以删除',
    await page.evaluate(() => (NovelFish.store.state.mask.customScripts || []).length) === 0);
  check('删掉之后选中的剧本回落成「混合」',
    await page.evaluate(() => NovelFish.store.state.mask.script) === 'auto',
    await page.evaluate(() => NovelFish.store.state.mask.script));

  /* ---- 内置剧本改不动，只能另存副本 ---- */
  await page.locator('#selScript').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await page.locator('#btnScriptEdit').click();
  await page.waitForTimeout(280);
  check('内置剧本打开编辑器时明说是另存副本',
    /另存为副本/.test(await page.locator('#seTitle').textContent()),
    await page.locator('#seTitle').textContent());
  check('编辑器带出了内置剧本原有的问答',
    /^Q: /.test(await page.locator('#sePairs').inputValue()));
  check('副本名自动加了「副本」后缀',
    /副本$/.test(await page.locator('#seName').inputValue()),
    await page.locator('#seName').inputValue());
  await page.locator('#btnScriptSave').click();
  await page.waitForTimeout(320);
  const copyState = await page.evaluate(() => {
    const list = NovelFish.camouflage.scripts;
    const last = list[list.length - 1];
    return {
      customs: (NovelFish.store.state.mask.customScripts || []).length,
      isCustom: !!last.custom,
      selected: last.id === NovelFish.store.state.mask.script
    };
  });
  check('另存后生成一条自建剧本并选中它',
    copyState.customs === 1 && copyState.isCustom && copyState.selected,
    JSON.stringify(copyState));
  await shot('43-script-copy');

  // 内置剧本本身还在
  check('内置剧本没有被改动',
    await page.evaluate(() => NovelFish.camouflage.raw.filter(s => !s.custom).length) >= 13);

  await page.locator('#btnScriptDel').click();
  await page.waitForTimeout(280);
  check('副本可以删掉，内置剧本删不动',
    await page.evaluate(() => (NovelFish.store.state.mask.customScripts || []).length) === 0);
  await page.locator('#selScript').selectOption({ index: 1 });
  await page.waitForTimeout(150);
  await page.locator('#btnScriptDel').click();
  await page.waitForTimeout(250);
  check('点删除内置剧本时给出说明而不是静默失败',
    /内置剧本删不掉/.test(await page.locator('#toastWrap').textContent()),
    (await page.locator('#toastWrap').textContent()).trim());

  /* ---- 模型服务的切换与删除 ---- */
  await page.locator('.ctab[data-tab="model"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => NovelFish.api.model.save({
    name: '第二条', baseUrl: 'http://127.0.0.1:8999/v1', apiKey: 'k', model: 'm2'
  }));
  await page.waitForTimeout(250);
  check('可以配置多条模型服务', await page.locator('#svcList .svc-item').count() === 2);
  check('新加的服务不会抢走「使用中」',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name) === '本地假模型');

  await page.locator('#svcList .svc-item').nth(1).click();
  await page.waitForTimeout(250);
  check('点列表里的服务即切换当前服务',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name) === '第二条',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name));
  const editingBase = await page.locator('#svcBase').inputValue();
  check('编辑区跟着换成刚点的那条', /8999/.test(editingBase), editingBase);

  await page.locator('#svcList .svc-item').first().click();
  await page.waitForTimeout(250);
  check('点回第一条就切回它',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name) === '本地假模型',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name));
  check('编辑区也跟着换回第一条',
    /8932/.test(await page.locator('#svcBase').inputValue()));

  await page.locator('#svcList .svc-item').nth(1).click();
  await page.waitForTimeout(200);
  await page.locator('#btnSvcDel').click();
  await page.waitForTimeout(280);
  check('服务可以删除', await page.locator('#svcList .svc-item').count() === 1);
  check('删掉当前服务后自动落到剩下那条',
    await page.evaluate(() => (NovelFish.api.model.active() || {}).name) === '本地假模型');

  /* ---- 关掉流式：一次性拿回整段，且模型没给推理时撤掉整块「深度思考」 ---- */
  await page.locator('.ctab[data-tab="model"]').click();
  await page.waitForTimeout(180);
  await page.locator('#swStream').click();
  await page.waitForTimeout(200);
  check('流式开关已关闭', await page.evaluate(() => NovelFish.store.state.model.stream) === false);

  mock.reset();
  await page.locator('#consoleClose').click();
  await page.waitForTimeout(250);
  await page.locator('.ds-input').fill('非流式也问一次');
  await page.locator('.ds-input').press('Enter');
  await settle();
  const plain = await turnView();
  check('非流式请求 body.stream 是 false', mock.calls[0].body.stream === false);
  check('非流式同样能拿到完整回答', plain.storeAnswer.length >= mockMod.ANSWER.length,
    String(plain.storeAnswer.length));
  check('模型没给推理时，整块「深度思考」撤掉（和真官网一致）',
    plain.thinkCount === 0, String(plain.thinkCount));

  await page.evaluate(() => NovelFish.api.model.setStream(true));

  /* ---- 刷新后模型对话的思考与回答都还在 ---- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds', { timeout: 6000 });
  await page.waitForTimeout(700);
  const afterReload = await page.evaluate(() => {
    const list = NovelFish.chat.exchanges;
    const withReason = list.filter(x => x.mode === 'model' && (x.reasoning || '').length > 10);
    const last = withReason[withReason.length - 1] || {};
    return {
      models: list.filter(x => x.mode === 'model').length,
      reasoned: withReason.length,
      reasoning: (last.reasoning || '').slice(0, 16),
      answer: (last.a || '').slice(0, 16),
      rendered: document.querySelectorAll('.ds-think-text').length
    };
  });
  check('刷新后模型消息仍在', afterReload.models >= 1, String(afterReload.models));
  check('刷新后思考原文仍然带着，并且渲染回了思考框',
    afterReload.reasoned >= 1 && afterReload.rendered >= afterReload.reasoned,
    JSON.stringify(afterReload));

  /* ---- 错误分类：Key 错 / 模型名错 / 连不上，都要说人话 ---- */
  const errBefore = errors.length;
  const classify = await page.evaluate(async (base) => {
    const mk = over => Object.assign({
      id: '', name: 'x', baseUrl: base, apiKey: 'sk-ok', model: 'm', extra: ''
    }, over);
    const r = {};
    r.auth = await NovelFish.api.model.probe(mk({ apiKey: 'bad-key' }));
    r.model = await NovelFish.api.model.probe(mk({ model: 'no-such-model' }));
    r.net = await NovelFish.api.model.probe(mk({ baseUrl: 'http://127.0.0.1:8999/v1' }));
    r.json = await NovelFish.api.model.probe(mk({ extra: '{oops' }));
    return {
      auth: r.auth.message, model: r.model.message,
      net: r.net.message, json: r.json.message,
      authOk: r.auth.ok, modelOk: r.model.ok
    };
  }, 'http://127.0.0.1:' + MOCK_PORT + '/v1');
  check('Key 无效 → 直接点明是 Key 的问题',
    !classify.authOk && /API Key 无效/.test(classify.auth), classify.auth);
  check('模型名不对 → 提示地址或模型名',
    !classify.modelOk && /404/.test(classify.model), classify.model);
  check('连不上 → 说明可能是跨域，并回显地址',
    /连不上/.test(classify.net) && /跨域/.test(classify.net), classify.net.slice(0, 60));
  check('额外参数不是合法 JSON → 当场报错而不是静默丢弃',
    /额外参数/.test(classify.json), classify.json);
  await page.waitForTimeout(500);
  errors.splice(errBefore);      // 上面这几个失败请求是有意发的

  check('分流与模型对话全程无页面错误', errors.length === 0, errors.join(' | '));

  /* ---------- 汇总 ---------- */
  console.log('\n== PASS (' + ok.length + ') ==');
  ok.forEach(l => console.log('  ✓ ' + l));
  if (fail.length) {
    console.log('\n== FAIL (' + fail.length + ') ==');
    fail.forEach(l => console.log('  ✗ ' + l));
  }
  console.log('\n== 页面错误 (' + errors.length + ') ==');
  console.log(errors.length ? errors.join('\n') : '  （无）');

  await browser.close();
  await mock.close();
  try { fs.unlinkSync(AVATAR_PNG); } catch (e) { /* 已经删掉就算了 */ }
  try { fs.unlinkSync(FAKE_EPUB); } catch (e) { /* 已经删掉就算了 */ }
  [SHARE_TXT, OTHER_TXT, BIG_TXT].forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* noop */ } });
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(2); });
