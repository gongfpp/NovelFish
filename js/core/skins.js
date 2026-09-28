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
         favicon: '<svg .../>'             // 内联 SVG 字符串（可空）
       },
       mount(rootEl, api) { ... },         // 必填：把皮肤渲染进 rootEl
       unmount() { ... },                  // 选填：切走时清理
     })

   ── mount 可用的 api（跨皮肤通用能力，由核心提供）────────
     api.escape(str)             HTML 转义
     api.richText(str)           简易 Markdown → HTML（伪装回答用）
     api.pickCamouflage()        取下一组伪装问答 { q, a }
     api.historyTitles(n)        取一组伪装的「最近对话」标题
     api.mountThinking(body, scroller)
                                 把小说挂进「深度思考」容器，返回 feed 控制器
                                 · refresh()        重渲染（字号/切章后调用）
                                 · appendNext()      追加下一章（滚到底自动触发）
                                 · gotoChapter(i)    跳章
                                 · next() / prev()
                                 · scrollToTop() / scrollByPx(n)
                                 · ensureMore()
                                 · destroy()         切换皮肤前必须调用
     api.gotoChapter(i)          以字节为单位跳章（内部会同步所有已挂载 feed）
     api.progressPercent()       0-100
     api.toc()                   目录 [{ index, title, paras }]
     api.doc                     小说文档 { title, chapters, totalChars }
     api.reading                 阅读参数 { font, line, width, auto, speed }
     api.mask                    伪装参数 { script, blurCollapse, openThinking }
     api.on(evt, fn)             订阅：'reading' | 'progress' | 'mask' | 'panic'
     api.isPanic()               当前是否处于老板键隐藏态
     api.setOpenThinking(bool)   设置「深度思考」默认展开态
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
