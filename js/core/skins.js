/* ============================================================
   skins.js — 皮肤插件注册器

   ── 插件契约 ─────────────────────────────────────────────
   一个皮肤 = 1 个 JS（js/skins/<id>.js） + 1 个 CSS（css/skins/<id>.css）

   js/skins/<id>.js 里调用：
     NovelFish.defineSkin({
       id:    'xxx',                       // 唯一标识，需与文件名一致
       name:  '某某',                       // 控制台显示名
       brand: { color: '#4D6BFE', letter: 'D' },
       desc:  '一句话说明伪装成什么',
       shell: {                            // 供浏览器外框使用
         url:   'chat.deepseek.com',       // 地址栏文本
         title: 'DeepSeek - 探索未至之境',  // 标签页标题
         favicon: '<svg .../>'             // 内联 SVG 标记，或 data: URI（可空）
       },
       mount(rootEl, api) { ... },         // 必填：把皮肤渲染进 rootEl
       unmount() { ... },                  // 选填：切走时清理
     })

   ── mount 可用的 api（跨皮肤通用能力，由核心提供）────────
     内容
       api.escape(str)             HTML 转义
       api.richText(str)           简易 Markdown → HTML（含表格 / 代码块 / 列表）
       api.pickCamouflage()        取下一组伪装问答 { q, a }（不落盘）
       api.historyTitles(n)        取一组伪装的「最近对话」标题

     会话（左侧聊天记录 / 对话列表的数据源，见 js/core/chat.js）
       api.chat                    会话模块本体
       api.convs                   按今天/昨天/7天内/30天内/更早分好组的会话
       api.activeConv              当前会话 { id, title, ... }
       api.exchanges               当前会话的伪装问答数组（首次读取时按需生成）
       api.selectConv(id)          切换会话
       api.newConv()               新建会话
       api.makeExchange({ q })     取一组问答并写入当前会话；q 可覆盖提问内容
       api.insertTemplate(s, i)    把第 s 个剧本的第 i 组问答插到当前对话末尾

     阅读
       api.mountThinking(body, scroller, { noRestore })
                                   把小说挂进「深度思考」容器，返回 feed 控制器
                                   · refresh() / appendNext() / gotoChapter(i)
                                   · next() / prev() / scrollToTop() / scrollByPx(n)
                                   · ensureMore() / savePos() / restorePos() / destroy()
       api.gotoChapter(i)          换章（内部会同步所有已挂载 feed）
       api.progressPercent()       0-100，按「正在读的章」算
       api.currentChapter()        当前正在读的章节序号
       api.toc()                   目录 [{ index, title, paras }]
       api.doc                     小说文档 { title, chapters, totalChars }
       api.reading                 阅读参数 { font, line, width, auto, speed }
       api.loadNovelFile(file)     把用户选的文件当新书载入（皮肤里的「上传文件」可用）

     伪装 / 外框
       api.mask                    伪装参数 { script, blurCollapse, openThinking,
                                                 chrome, os, webSearch }
       api.isSidebarOpen() / setSidebar(v)
       api.sidebarQuery() / setSidebarQuery(v)
                                   侧边栏搜索词
       api.setOs('mac' | 'win')    切换浏览器外框版本
       api.setOpenThinking(v) / setWebSearch(v)

     浏览器资料（地址栏右侧的头像按钮与资料面板）
       api.browserProfile()        { name, email, avatar, avatarColor, tabTitle }
       api.setBrowserProfile(k, v) 改一项；会自动刷新外框并广播 'browser-profile'

     消息操作
       api.rollAnswer(i)           第 i 组问答换一条同剧本的其它回答，返回新条目
       api.vote(i, v)              v = 1 赞 / -1 踩 / 再点一次取消，返回当前值

     浏览器行为
       api.zoom() / setZoom(z)     视口缩放（0.5 - 2）
       api.openFind()              调出页内查找条

     其它
       api.on(evt, fn)             订阅：'reading' | 'progress' | 'mask' | 'panic'
                                         | 'conv' | 'thread-reload' | 'sidebar'
                                         | 'browser-profile' | 'find'
       api.isPanic()               当前是否处于老板键隐藏态
       api.toast(msg)              提示
       api.registerFeed(feed)      把当前 feed 交给核心托管（自动滚动 / 全局跳章要用）
   ============================================================ */
(function (NF) {
  'use strict';

  /* 皮肤清单：新增皮肤只需在这里登记一行 */
  var manifest = [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      brand: { color: '#4D6BFE', letter: 'D' },
      desc: '首期目标：伪装成 Chrome 打开 chat.deepseek.com，正文藏进「深度思考」折叠框',
      status: 'live'
    },
    {
      id: 'gpt',
      name: 'GPT 桌面端',
      brand: { color: '#10A37F', letter: 'G' },
      desc: '伪装成 ChatGPT 桌面客户端，正文藏进「Thought for a few seconds」折叠段',
      status: 'live'
    },
    {
      id: 'zhipu',
      name: '智谱清言',
      brand: { color: '#3B6EF0', letter: '智' },
      desc: '伪装成智谱清言网页版，正文藏进「深度思考」过程',
      status: 'planned'
    },
    {
      id: 'doubao',
      name: '豆包',
      brand: { color: '#3C6CF9', letter: '豆' },
      desc: '伪装成豆包网页版，正文藏进「深度思考」折叠区',
      status: 'planned'
    },
    {
      id: 'zcode',
      name: 'Z Code',
      brand: { color: '#1F1F1F', letter: 'Z' },
      desc: '伪装成 Z Code 桌面端，正文藏进工具调用前的推理输出',
      status: 'planned'
    },
    {
      id: 'opencode',
      name: 'Open Code',
      brand: { color: '#0F172A', letter: 'O' },
      desc: '伪装成 Open Code 终端界面，正文作为 reasoning 段落流式滚出',
      status: 'planned'
    },
    {
      id: 'workbuddy',
      name: 'WorkBuddy 桌面端',
      brand: { color: '#2B7FFF', letter: 'W' },
      desc: '伪装成 WorkBuddy 桌面端会话，正文藏进 reasoning 折叠块',
      status: 'planned'
    }
  ];

  var registry = {};      // id → 已加载的皮肤定义
  var loading = {};       // id → Promise
  var injected = {};      // 记录已注入的 css

  function entryOf(id) {
    for (var i = 0; i < manifest.length; i++) if (manifest[i].id === id) return manifest[i];
    return null;
  }

  function injectCss(id) {
    if (injected[id]) return;
    injected[id] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/skins/' + id + '.css';
    link.dataset.skin = id;
    document.head.appendChild(link);
  }

  /**
   * 懒加载皮肤：注入 css + js，等 defineSkin 注册完成
   * @returns Promise<skinDef>
   */
  function load(id) {
    if (registry[id]) return Promise.resolve(registry[id]);
    if (loading[id]) return loading[id];

    var entry = entryOf(id);
    if (!entry) return Promise.reject(new Error('皮肤未登记：' + id));

    loading[id] = new Promise(function (resolve, reject) {
      injectCss(id);
      var s = document.createElement('script');
      s.src = 'js/skins/' + id + '.js';
      s.async = false;
      s.onload = function () {
        if (registry[id]) resolve(registry[id]);
        else reject(new Error('皮肤脚本未调用 defineSkin：' + id));
      };
      s.onerror = function () { reject(new Error('皮肤脚本加载失败：' + id)); };
      document.head.appendChild(s);
    });

    return loading[id];
  }

  /** 皮肤文件在加载时自行调用，完成注册 */
  function defineSkin(def) {
    if (!def || !def.id) throw new Error('defineSkin 需要一个带 id 的定义');
    registry[def.id] = def;
  }

  NF.skins = {
    manifest: manifest,
    defineSkin: defineSkin,
    get: function (id) { return registry[id] || null; },
    entry: entryOf,
    load: load,
    list: function () {
      return manifest.map(function (m) {
        return {
          id: m.id,
          name: m.name,
          brand: m.brand,
          desc: m.desc,
          status: m.status,
          loaded: !!registry[m.id]
        };
      });
    }
  };

  NF.defineSkin = defineSkin;
})(window.NovelFish);
