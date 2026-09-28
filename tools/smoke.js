/* ============================================================
   tools/smoke.js — 端到端冒烟测试（Playwright + Chromium）
   覆盖：
     核心渲染 / 老板键 / 切章 / 滚动续章 / 发送消息 / 控制台 /
     排版参数 / 皮肤热切换 / 刷新恢复 /
     macOS 与 Windows 双外框 / Chrome 与 Edge 双外框 /
     地址栏与工具栏图标注入 / 站点信息、扩展程序、个人资料、主菜单四个面板 /
     侧边栏开关 / 对话列表切换与搜索 /
     置顶折叠条吸顶 / 净读一键折叠双方正文 / 模板库 / file:// 可用性
   运行：
     cd <项目根> && python3 -m http.server 8931 --bind 127.0.0.1 &
     NODE_PATH=<playwright 所在 node_modules> node tools/smoke.js
   截图输出到 $SHOT（默认 /tmp/nf-shots）
   退出码：0 全通过 / 1 有断言失败 / 2 崩溃
   ============================================================ */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const SHOT = process.env.SHOT || '/tmp/nf-shots';
const FILE_URL = process.env.FILE_URL || 'file://' + require('path').resolve(__dirname, '..', 'index.html');

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  const fail = [];
  const ok = [];
  const check = (name, cond, extra = '') => {
    (cond ? ok : fail).push(name + (cond ? '' : '  <<< FAIL ' + extra));
  };
  const shot = n => page.screenshot({ path: SHOT + '/' + n + '.png' });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.ds', { timeout: 5000 });
  await page.waitForTimeout(600);

  /* ---------- 1. 骨架 ---------- */
  check('DeepSeek 皮肤已挂载', await page.locator('.ds').count() === 1);
  check('深度思考框默认展开', await page.locator('.ds-think').last().getAttribute('data-open') === '1');
  check('标签页标题正确', (await page.locator('#tabTitle').textContent()).includes('DeepSeek'));
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
  await page.waitForTimeout(80);

  /* ---------- 5. 置顶折叠条 ---------- */
  check('顶部有置顶的「深度思考」折叠条',
    await page.locator('.ds-sticky .ds-think-toggle').count() === 1);
  await page.locator('.ds-thread').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(350);
  const stickDelta = await page.evaluate(() => {
    const s = document.querySelector('.ds-sticky');
    const t = document.querySelector('.ds-thread');
    return s.getBoundingClientRect().top - t.getBoundingClientRect().top;
  });
  check('折叠条在滚动后仍然吸顶', Math.abs(stickDelta) < 2, 'delta=' + stickDelta.toFixed(2));

  await page.locator('.ds-think-toggle').click();
  await page.waitForTimeout(250);
  check('点折叠条即收起最新思考框',
    await page.locator('.ds-think').last().getAttribute('data-open') === '0');
  check('折叠条自身状态同步为收起',
    await page.locator('.ds-think-toggle').getAttribute('data-open') === '0');
  check('收起后正文不可见', !(await page.locator('.ds-think-body .nf-p').last().isVisible()));
  await page.locator('.ds-think-toggle').click();
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

  /* ---------- 7. 净读：一键折叠对话双方正文 ---------- */
  const aiBefore = await page.locator('.ds-ai-msg').count();
  await page.locator('.ds-fold-all').click();
  await page.waitForTimeout(250);
  check('净读生效（thread 标记为 readonly）',
    await page.locator('.ds-thread').getAttribute('data-readonly') === '1');
  check('净读下回答正文被折叠', !(await page.locator('.ds-answer').first().isVisible()));
  check('净读下提问气泡仍保留一行摘要',
    await page.locator('.ds-bubble').first().isVisible());
  check('净读下「深度思考」里的正文依然可读',
    await page.locator('.ds-ai-msg').last().locator('.nf-p').first().isVisible());
  await shot('03-readonly');

  // 净读 + 老板键同时触发不能变成一片空白
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('净读态下按老板键会临时放出伪装回答',
    await page.locator('.ds-answer').first().isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('恢复后净读状态被还原', await page.locator('.ds-answer').first().isHidden());
  check('净读下对话条数不变', await page.locator('.ds-ai-msg').count() === aiBefore);

  /* 关闭净读 */
  await page.locator('.ds-fold-all').click();
  await page.waitForTimeout(200);
  check('净读可关闭', await page.locator('.ds-thread').getAttribute('data-readonly') === '0');

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

  // 搜索
  const total = await page.locator('.ds-hist-item').count();
  await page.locator('.ds-search input').fill('接口');
  await page.waitForTimeout(400);
  const filtered = await page.locator('.ds-hist-item').count();
  check('搜索能过滤对话列表', filtered >= 1 && filtered < total, `${total} -> ${filtered}`);
  await page.locator('.ds-search-clear').click();
  await page.waitForTimeout(300);
  check('清空搜索后恢复全部对话',
    await page.locator('.ds-hist-item').count() === total);

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
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(300);
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
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="read"]').click();
  await page.waitForTimeout(150);
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
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="look"]').click();
  await page.waitForTimeout(150);
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

  // 切到 Edge
  const chBeforeEdge = await page.evaluate(() => NovelFish.api.currentChapter());
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="look"]').click();
  await page.waitForTimeout(150);
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
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="look"]').click();
  await page.waitForTimeout(150);
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
  check('欢迎页不显示顶部折叠条', await page.locator('.ds-sticky').count() === 0);
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
  await page.locator('.ds-icon-btn.ds-open-console').click();
  await page.waitForTimeout(250);
  await page.locator('.ctab[data-tab="skin"]').click();
  await page.waitForTimeout(150);
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
  check('阅读偏移已记录（相对正文容器）',
    typeof savedOff === 'number' && Math.abs(savedOff - 300) < 24, 'off=' + savedOff);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.ds-think-body .nf-p');
  await page.waitForTimeout(700);
  const restoredTop = await page.locator('.ds-thread').evaluate(e => e.scrollTop);
  check('刷新后恢复滚动位置', Math.abs(restoredTop - savedTop) < 90, `${savedTop} -> ${restoredTop}`);
  const restoredOff = await page.evaluate(() => NovelFish.store.state.progress.feedOffset);
  check('刷新后相对偏移一致', Math.abs(restoredOff - savedOff) < 24, `${savedOff} -> ${restoredOff}`);
  check('刷新后恢复对话条数',
    await page.locator('.ds-ai-msg').count() === msgBeforeReload);
  check('刷新后仍停在同一会话',
    (await page.locator('.ds-top-title').textContent()) === convTitleBeforeReload);
  check('刷新后仍保持 macOS 外框',
    await page.locator('#app').getAttribute('data-os') === 'mac');
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
    sticky: !!document.querySelector('.ds-sticky .ds-think-toggle'),
    convs: document.querySelectorAll('.ds-hist-item').length,
    readerCss: [...document.styleSheets].some(s => (s.href || '').includes('reader.css')),
    font: getComputedStyle(document.documentElement).getPropertyValue('--nf-font').trim(),
    chapters: NovelFish.novel.chapterCount()
  }));
  check('file:// 下皮肤正常挂载', fileState.skin);
  check('file:// 下置顶折叠条存在', fileState.sticky);
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
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(2); });
