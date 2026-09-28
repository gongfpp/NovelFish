/* ============================================================
   tools/smoke.js — 端到端冒烟测试（Playwright + Chromium）
   覆盖：核心渲染 / 老板键 / 切章 / 滚动续章 / 发送消息 /
         控制台 / 排版参数 / 皮肤热切换 / 刷新恢复 / file:// 可用性
   运行：
     cd <项目根> && python3 -m http.server 8931 --bind 127.0.0.1 &
     NODE_PATH=<playwright 所在 node_modules> node tools/smoke.js
   截图输出到 $SHOT（默认 /tmp/nf-shots）
   ============================================================ */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const SHOT = process.env.SHOT || '/tmp/nf-shots';

(async () => {
  const errors = [];
  const logs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
    else logs.push(m.type() + ': ' + m.text());
  });

  const fail = [];
  const ok = [];
  const check = (name, cond, extra = '') => {
    (cond ? ok : fail).push(name + (cond ? '' : '  <<< FAIL ' + extra));
  };

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.ds', { timeout: 5000 });
  await page.waitForTimeout(600);

  // ---- 1. 骨架 ----
  check('DeepSeek 皮肤已挂载', await page.locator('.ds').count() === 1);
  check('深度思考框默认展开', await page.locator('.ds-think').first().getAttribute('data-open') === '1');
  check('标签页标题正确', (await page.locator('#tabTitle').textContent()).includes('DeepSeek'));
  check('地址栏正确', (await page.locator('#omniUrl').textContent()) === 'chat.deepseek.com');

  // ---- 2. 小说渲染在思考框内 ----
  await page.waitForSelector('.ds-think-body .nf-p');
  const active = page.locator('.ds-ai-msg').last();
  const pCount = await active.locator('.nf-p').count();
  const firstP = (await active.locator('.nf-p').first().textContent()).trim();
  check('思考框内有正文段落', pCount >= 3, 'count=' + pCount);
  check('正文是小说而非伪装内容', firstP.startsWith('潮汐城所有的灯'), firstP.slice(0, 30));
  check('思考框外没有小说正文',
    !(await page.locator('.ds-answer').first().textContent()).includes('潮汐城'));

  // ---- 3. 伪装内容存在 ----
  const ans = (await page.locator('.ds-answer').first().textContent()) || '';
  check('回答正文有伪装内容', ans.length > 60, 'len=' + ans.length);
  check('伪装内容含代码或列表形式的答复', /```|快排|SQL|时区|布局|周报|接口|检索|依赖|排序/.test(ans));
  const bubble = (await page.locator('.ds-bubble').first().textContent()) || '';
  check('用户气泡是工作问题', bubble.length > 4, bubble.slice(0, 20));

  // ---- 4. 老板键 ----
  await page.screenshot({ path: SHOT + '/01-reading.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const openAfterEsc = await page.locator('.ds-think').first().getAttribute('data-open');
  const novelVisible = await page.locator('.ds-think-body .nf-p').first().isVisible();
  check('Esc 收起后思考框关闭', openAfterEsc === '0');
  check('Esc 收起后正文不可见', novelVisible === false);
  const ansVisibleAfterEsc = await page.locator('.ds-answer').first().isVisible();
  check('Esc 收起后仍能看到伪装回答', ansVisibleAfterEsc === true);
  await page.screenshot({ path: SHOT + '/02-panic.png' });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('再按 Esc 恢复阅读', await page.locator('.ds-think').first().getAttribute('data-open') === '1');

  // ---- 5. 章节跳转 ----
  const beforeScroll = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const secCount = await active.locator('.nf-sec').count();
  check('下一章后思考框只有新章内容', secCount === 1, 'sec=' + secCount);
  const chTitle = (await active.locator('.nf-ch').first().textContent()).trim();
  check('跳到第二章', chTitle.includes('第二章'), chTitle);
  void beforeScroll;

  // ---- 6. 滚动续章 ----
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(900);
  const secAfter = await active.locator('.nf-sec').count();
  check('滚到底自动续下一章', secAfter >= 2, 'sec=' + secAfter);

  // ---- 7. 发送消息 → 新伪装对话，旧思考收起 ----
  const msgBefore = await page.locator('.ds-ai-msg').count();
  await page.locator('.ds-input').fill('帮我把这个方案的落地步骤梳理一下');
  await page.locator('.ds-input').press('Enter');
  await page.waitForTimeout(600);
  const msgAfter = await page.locator('.ds-ai-msg').count();
  check('发送后追加新对话', msgAfter === msgBefore + 1, `${msgBefore}->${msgAfter}`);
  const lastOpen = await page.locator('.ds-think').last().getAttribute('data-open');
  check('最新思考框处于展开态', lastOpen === '1');
  const openCount = await page.locator('.ds-think[data-open="1"]').count();
  check('历史思考框全部收起', openCount === 1, 'open=' + openCount);
  const newBodyHasNovel = (await page.locator('.ds-ai-msg').last().locator('.nf-p').count()) > 3;
  check('新思考框继续承载小说', newBodyHasNovel);
  await page.screenshot({ path: SHOT + '/03-second-exchange.png' });

  // ---- 8. 控制台 ----
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(300);
  check('控制台可打开', await page.locator('#console').isVisible());
  const chItems = await page.locator('.chapter-item').count();
  check('章节目录已生成', chItems >= 3, 'items=' + chItems);
  const skinCards = await page.locator('.skin-card').count();
  check('皮肤清单已渲染', skinCards >= 6, 'cards=' + skinCards);
  const disc = (await page.locator('#bookSub').textContent()) || '';
  check('书目信息正确', disc.includes('章'), disc);
  await page.screenshot({ path: SHOT + '/04-console.png' });

  // ---- 9. 字号 / 排版参数 ----
  await page.locator('.ctab[data-tab="read"]').click();
  await page.waitForTimeout(150);
  const fontBefore = await page.locator('.ds-ai-msg').last().locator('.ds-think-body').evaluate(e => getComputedStyle(e).fontSize);
  await page.locator('#rFont').evaluate(el => {
    el.value = '20';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const fontAfter = await page.locator('.ds-ai-msg').last().locator('.ds-think-body').evaluate(e => getComputedStyle(e).fontSize);
  check('字号参数生效', fontBefore !== fontAfter && fontAfter === '20px', `${fontBefore}->${fontAfter}`);

  // ---- 10. 切章（控制台） ----
  await page.locator('.ctab[data-tab="book"]').click();
  await page.waitForTimeout(150);
  await page.locator('.chapter-item').first().click();
  await page.waitForTimeout(400);
  const chAfterClick = (await page.locator('.ds-ai-msg').last().locator('.nf-ch').first().textContent()).trim();
  check('控制台跳章生效', chAfterClick.includes('第一章'), chAfterClick);

  const hint = (await page.locator('#progHint').textContent()) || '';
  check('进度按「正在读的章」计算而非已载入章', hint.includes('第 1 / 4 章 · 25%'), hint);

  // ---- 11. 皮肤热切换（插件可插拔） ----
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="skin"]').click();
  await page.waitForTimeout(150);
  const chBeforeSwitch = await page.evaluate(() => NovelFish.store.state.progress.chapter);
  await page.locator('.skin-card[data-skin="gpt"]').click();
  await page.waitForTimeout(700);
  check('切换到 GPT 皮肤', await page.locator('.gpt').count() === 1);
  check('切换后地址栏同步', (await page.locator('#omniUrl').textContent()) === 'chatgpt.com');
  check('切换后标签页标题同步', (await page.locator('#tabTitle').textContent()) === 'ChatGPT');
  const gptP = await page.locator('.gpt-think .nf-p').count();
  check('GPT 皮肤里同样渲染了正文', gptP > 3, 'p=' + gptP);
  const gptAns = (await page.locator('.gpt-answer').first().textContent()) || '';
  check('GPT 皮肤里伪装回答正常', gptAns.length > 60, 'len=' + gptAns.length);
  check('GPT 皮肤无残留 DeepSeek 节点', await page.locator('.ds').count() === 0);
  await page.screenshot({ path: SHOT + '/06-gpt.png' });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('GPT 皮肤下老板键可用', await page.locator('.gpt-msg[data-open="1"]').count() === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('GPT 皮肤可恢复阅读态', await page.locator('.gpt-msg[data-open="1"]').count() === 1);

  await page.locator('.gpt-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.skin-card[data-skin="deepseek"]').click();
  await page.waitForTimeout(700);
  check('切回 DeepSeek 皮肤', await page.locator('.ds').count() === 1);
  const chAfterSwitch = await page.evaluate(() => NovelFish.store.state.progress.chapter);
  check('切换皮肤后阅读章节不丢', chAfterSwitch === chBeforeSwitch, chBeforeSwitch + ' -> ' + chAfterSwitch);

  // ---- 12. 刷新后恢复进度 ----
  // 把阅读位滚到「正文容器顶部往下 300px」处，这才是真实阅读位置
  await page.locator('.ds-thread').evaluate(e => {
    const b = e.querySelector('.ds-ai-msg:last-child .ds-think-body');
    const top = b.getBoundingClientRect().top - e.getBoundingClientRect().top + e.scrollTop;
    e.scrollTop = top + 300;
  });
  await page.waitForTimeout(400);
  const savedTop = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  const savedOff = await page.evaluate(() => NovelFish.store.state.progress.feedOffset);
  check('阅读偏移已记录（相对正文容器）', typeof savedOff === 'number' && Math.abs(savedOff - 300) < 20, 'off=' + savedOff);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds-think-body .nf-p');
  await page.waitForTimeout(700);
  const restoredTop = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  check('刷新后恢复滚动位置', Math.abs(restoredTop - savedTop) < 80, `${savedTop} -> ${restoredTop}`);
  const restoredOff = await page.evaluate(() => NovelFish.store.state.progress.feedOffset);
  check('刷新后相对偏移一致', Math.abs(restoredOff - savedOff) < 20, `${savedOff} -> ${restoredOff}`);
  const restoredExchanges = await page.locator('.ds-ai-msg').count();
  check('刷新后恢复对话条数', restoredExchanges === msgAfter, 'n=' + restoredExchanges);

  await page.screenshot({ path: SHOT + '/05-after-reload.png' });

  console.log('\n== PASS ==');
  ok.forEach(l => console.log('  ✓ ' + l));
  if (fail.length) {
    console.log('\n== FAIL ==');
    fail.forEach(l => console.log('  ✗ ' + l));
  }
  console.log('\n== 页面错误 ==');
  console.log(errors.length ? errors.join('\n') : '  （无）');

  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(2); });
