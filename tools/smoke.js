/* ============================================================
   tools/smoke.js — 端到端冒烟测试（Playwright + Chromium）
   覆盖：
     核心渲染 / 老板键 / 切章 / 滚动续章 / 发送消息 / 控制台 /
     排版参数 / 皮肤热切换 / 刷新恢复 /
     macOS 与 Windows 双外框 / Chrome 与 Edge 双外框 /
     地址栏与工具栏图标注入 / 站点信息、扩展程序、个人资料、主菜单四个面板 /
     侧边栏开关 / 对话列表切换与搜索 /
     「深度思考」表头冻结吸顶 / 消息操作条 / 分享弹窗 /
     标签页标题与登录头像自定义 / 主菜单的查找、缩放、删除浏览数据 /
     模板库 / file:// 可用性
   运行：
     cd <项目根> && python3 -m http.server 8931 --bind 127.0.0.1 &
     NODE_PATH=<playwright 所在 node_modules> node tools/smoke.js
   截图输出到 $SHOT（默认 /tmp/nf-shots）
   退出码：0 全通过 / 1 有断言失败 / 2 崩溃
   ============================================================ */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const SHOT = process.env.SHOT || '/tmp/nf-shots';
const FILE_URL = process.env.FILE_URL || 'file://' + require('path').resolve(__dirname, '..', 'index.html');

/* 上传头像用的 1x1 PNG，跑完就删 */
const AVATAR_PNG = path.join(os.tmpdir(), 'nf-avatar-' + process.pid + '.png');
fs.writeFileSync(AVATAR_PNG, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'));

(async () => {
  const errors = [];
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

  /** 走官网路径进设置面板：侧栏账户行 → 设置 */
  async function openConsole(pane) {
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
  check('冻结条下方是官网的渐隐遮罩',
    await page.locator('.ds-think-head').last().evaluate(e =>
      /gradient/.test(getComputedStyle(e, '::after').backgroundImage)));

  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(250);
  check('点冻结条即收起该思考框',
    await page.locator('.ds-think').last().getAttribute('data-open') === '0');
  check('收起后正文不可见', !(await page.locator('.ds-think-body .nf-p').last().isVisible()));
  await page.locator('.ds-think-head').last().click();
  await page.waitForTimeout(250);
  check('再点一次恢复展开',
    await page.locator('.ds-think').last().getAttribute('data-open') === '1');

  /* ---------- 6. 老板键 ---------- */
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  await shot('01-reading');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 收起全部思考框',
    await page.locator('.ds-think[data-open="1"]').count() === 0);
  check('Esc 收起后仍能看到伪装回答',
    await page.locator('.ds-answer').first().isVisible());
  await shot('02-panic');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('再按 Esc 恢复阅读',
    await page.locator('.ds-think[data-open="1"]').count() >= 1);

  /* ---------- 7. 消息操作条与分享（官网有的功能） ---------- */
  // 悬停才出现的操作条（先把鼠标挪开，避免上一步的悬停残留）
  await page.mouse.move(6, 6);
  await page.waitForTimeout(200);
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
  await page.waitForTimeout(500);
  const ansAfter = (await page.locator('.ds-ai-msg').last().locator('.ds-answer').textContent()).trim();
  check('「重新生成」换掉了回答正文', ansBefore !== ansAfter,
    ansBefore.slice(0, 18) + ' -> ' + ansAfter.slice(0, 18));
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

  // 分享弹窗
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
  await page.waitForTimeout(250);
  check('点「创建链接」后出现分享链接',
    await page.locator('.ds-modal-content .ds-linkbox').last().isVisible());
  const shareUrl = (await page.locator('.ds-modal-content .ds-linkbox span').last().textContent()) || '';
  check('分享链接是 chat.deepseek.com 的形状',
    /^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9]{18}$/.test(shareUrl), shareUrl);
  check('主按钮变成「复制链接」',
    (await page.locator('.ds-modal-actions .ds-btn--primary').last().textContent()).trim() === '复制链接');
  await shot('03-share');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 关闭分享弹窗', await page.locator('.ds-modal-content').last().isHidden());
  check('关弹窗的那次 Esc 不触发老板键',
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
  await page.locator('.ds-input').fill('帮我把这个方案的落地步骤梳理一下');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(700);
  const msgAfter = await page.locator('.ds-ai-msg').count();
  check('发送后追加新对话', msgAfter === msgBefore + 1, `${msgBefore}->${msgAfter}`);
  check('最新思考框处于展开态',
    await page.locator('.ds-think').last().getAttribute('data-open') === '1');
  check('历史思考框全部收起',
    await page.locator('.ds-think[data-open="1"]').count() === 1);
  check('新思考框继续承载小说',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 3);
  const typed = (await page.locator('.ds-bubble').last().textContent()) || '';
  check('输入框里打的字成为提问内容', typed.includes('落地步骤'), typed.slice(0, 20));

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
  check('切换会话不丢阅读章节',
    await page.evaluate(() => NovelFish.api.currentChapter()) === chBeforeConv);
  check('切换会话后仍能读到正文',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 2);

  // 搜索：官网是「搜索按钮 → 就地展开输入框」
  const total = await page.locator('.ds-hist-item').count();
  check('侧栏默认是「搜索」按钮', await page.locator('.ds-searchbtn').isVisible());
  await page.locator('.ds-searchbtn').click();
  await page.waitForTimeout(300);
  check('点搜索按钮展开输入框', await page.locator('.ds-search input').isVisible());
  await page.locator('.ds-search input').fill('接口');
  await page.waitForTimeout(450);
  const filtered = await page.locator('.ds-hist-item').count();
  check('搜索能过滤对话列表', filtered >= 1 && filtered < total, `${total} -> ${filtered}`);
  await page.locator('.ds-search-clear').click();
  await page.waitForTimeout(350);
  check('清空搜索后恢复全部对话',
    await page.locator('.ds-hist-item').count() === total);
  check('清空后搜索按钮回到原位', await page.locator('.ds-searchbtn').isVisible());

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

  // Esc 必须先吃掉面板，不能顺手触发老板键
  const thinkOpenBefore = await page.locator('.ds-think[data-open="1"]').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc 先关闭弹出面板', await page.locator('#popSite').isHidden());
  check('关面板的那次 Esc 不触发老板键',
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
  check('资料面板显示用户名', /摸鱼的人/.test(avatarTxt), avatarTxt.slice(0, 24));
  check('资料面板显示邮箱', /moyu\.ren@example\.com/.test(avatarTxt));
  check('资料面板显示同步状态', /同步功能已开启/.test(avatarTxt));
  await shot('14-pop-avatar');

  // 主菜单
  await page.locator('[data-pop="menu"]').click();
  await page.waitForTimeout(200);
  check('主菜单可打开', await page.locator('#popMenu').isVisible());
  check('主菜单项数正确',
    await page.locator('#popMenu .pop-item').count() === 16,
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
  check('关查找条的那次 Esc 不触发老板键',
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

  /* ---------- 17. 截图：macOS 外框下的完整体 ---------- */
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await shot('08-panic-mac');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ---------- 18. 新建对话 → 欢迎页 ---------- */
  await page.locator('.ds-newchat').click();
  await page.waitForTimeout(400);
  check('新建对话进入欢迎页', await page.locator('.ds-stage.is-welcome').count() === 1);
  check('欢迎页显示「Hi，我是 DeepSeek」',
    (await page.locator('.ds-welcome-title').textContent()).includes('DeepSeek'));
  check('欢迎页没有消息', await page.locator('.ds-ai-msg').count() === 0);
  check('欢迎页不显示顶部冻结条', await page.locator('.ds-think-head').count() === 0);
  check('欢迎页的输入框换成官网新会话态的大范围柔光',
    await page.locator('.ds-box').evaluate(e => {
      const s = getComputedStyle(e).boxShadow;
      return /rgba\(0, 0, 0, 0\.02\) 0px 4px 12px/.test(s) && /rgba\(72, 104, 178, 0\.03\) 0px 30px 60px/.test(s);
    }), await page.locator('.ds-box').evaluate(e => getComputedStyle(e).boxShadow));
  await shot('09-welcome');

  await page.locator('.ds-input').fill('帮我评审一段系统设计');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(700);
  check('新对话发送后进入正文', await page.locator('.ds-stage.is-welcome').count() === 0);
  check('新对话只有一组问答', await page.locator('.ds-ai-msg').count() === 1);
  check('新对话标题改成提问内容',
    (await page.locator('.ds-top-title').textContent()).includes('评审'),
    await page.locator('.ds-top-title').textContent());
  check('新对话出现在列表最前',
    (await page.locator('.ds-hist-item').first().textContent()).includes('评审'));
  check('新对话里正文可读',
    (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 2);

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

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('GPT 皮肤下老板键可用', await page.locator('.gpt-msg[data-open="1"]').count() === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('GPT 皮肤可恢复阅读态', await page.locator('.gpt-msg[data-open="1"]').count() === 1);

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
  try { fs.unlinkSync(AVATAR_PNG); } catch (e) { /* 已经删掉就算了 */ }
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(2); });
