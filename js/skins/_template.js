/* ============================================================
   _template.js — 皮肤插件模板（不会被加载，仅供复制）
   ─────────────────────────────────────────────────────────
   新增一个皮肤的完整步骤：
     1. 复制本文件为 js/skins/<你的id>.js
     2. 复制 css/skins/deepseek.css 为 css/skins/<你的id>.css（或新写）
     3. 在 js/core/skins.js 的 manifest 里登记一行：
          { id: '<你的id>', name: '显示名',
            brand: { color: '#xxxxxx', letter: 'X' },
            desc: '伪装成什么', status: 'live' }
     4. 刷新页面即可在「设置 → 皮肤」里切换

   核心已经提供的能力：
     · 小说解析、章节切分、滚动续章、进度持久化
     · 老板键、自动滚动、快捷键、字号行距
     · 伪装剧本库
   皮肤只需要负责：把「深度思考」容器画出来，然后把小说塞进去。
   ============================================================ */
(function (NF) {
  'use strict';

  NF.defineSkin({
    id: '_template',                 // 必须与文件名一致
    name: '模板皮肤',
    brand: { color: '#888888', letter: 'T' },
    desc: '一句话说明伪装成什么',
    shell: {
      url: 'example.com/chat',       // 浏览器地址栏
      title: '示例站点',              // 标签页标题
      favicon: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#888"/></svg>'
    },

    /**
     * @param {HTMLElement} root  皮肤根容器（已清空，高度 100%）
     * @param {object} api        核心能力层，见 js/core/skins.js 顶部契约
     */
    mount: function (root, api) {
      // ---------- 1. 画骨架 ----------
      root.innerHTML = '' +
        '<div class="tpl">' +
          '<main class="tpl-main">' +
            '<div class="tpl-thread"></div>' +
          '</main>' +
        '</div>';

      var thread = root.querySelector('.tpl-thread');

      // ---------- 2. 渲染一条伪装对话 ----------
      function renderExchange(item, isLast) {
        var open = isLast && api.mask.openThinking;

        var wrap = document.createElement('div');
        wrap.className = 'tpl-msg' + (isLast ? ' is-last' : '');
        wrap.dataset.open = open ? '1' : '0';
        wrap.innerHTML =
          '<div class="tpl-q">' + api.escape(item.q) + '</div>' +
          '<button class="tpl-think-head" type="button">深度思考</button>' +
          '<div class="tpl-think-body"></div>' +
          '<div class="tpl-a">' + api.richText(item.a) + '</div>';

        thread.appendChild(wrap);

        if (isLast) {
          // ---------- 3. 关键一步：把小说挂进思考容器 ----------
          // noRestore:true 表示"这是新发出的消息"，直接滚到底
          // 恢复历史位置时用 noRestore:false（默认）
          api.mountThinking(wrap.querySelector('.tpl-think-body'), thread,
            { noRestore: true });
        }
        return wrap;
      }

      // ---------- 4. 首次进入：渲染全部历史对话，只给最后一条挂正文 ----------
      var list = api.exchanges;
      if (!list.length) api.makeExchange();
      list.forEach(function (item, i) {
        renderExchange(item, i === list.length - 1);
      });
      thread.scrollTop = thread.scrollHeight;

      // ---------- 5. 折叠开关 ----------
      thread.addEventListener('click', function (e) {
        var head = e.target.closest('.tpl-think-head');
        if (!head) return;
        var msg = head.closest('.tpl-msg');
        msg.dataset.open = msg.dataset.open === '1' ? '0' : '1';
      });

      // ---------- 6. 老板键：必须实现，否则 Esc 会在本皮肤里失效 ----------
      var offPanic = api.on('panic', function (p) {
        Array.prototype.forEach.call(thread.querySelectorAll('.tpl-msg'), function (m) {
          m.dataset.open = p ? '0' : (m.classList.contains('is-last') ? '1' : '0');
        });
        if (p) thread.scrollTop = thread.scrollHeight;
      });

      // ---------- 7. 发送新消息：追加一条伪装对话，正文继续往下流 ----------
      // 需要时把 api.makeExchange() 的结果渲染出来：
      //   renderExchange(api.makeExchange(), true)
      // 注意：append 前先把上一条的 data-open 置为 '0'

      // ---------- 8. 卸载时清理监听，避免切换皮肤后事件泄漏 ----------
      this._off = offPanic;
    },

    unmount: function () {
      if (this._off) this._off();
    }
  });
})(window.NovelFish);
