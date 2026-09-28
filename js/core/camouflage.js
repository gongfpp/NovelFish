/* ============================================================
   camouflage.js — 伪装剧本库
   「深度思考」框里放小说，问答正文放这里的内容。
   每个剧本是一组可轮换的问答对，发送新消息时按顺序取用，
   旧对话自然沉到上方，形成可持续阅读的「工作记录」。
   ============================================================ */
(function (NF) {
  'use strict';

  function code(lang, body) { return '```' + lang + '\n' + body + '\n```'; }
  function join() { return Array.prototype.slice.call(arguments).join('\n\n'); }

  var scripts = [
    {
      id: 'python',
      name: '后端开发（Python）',
      topic: 'Python 接口优化',
      pairs: [
        {
          q: '帮我写一个快速排序，要求处理大量重复元素时不要退化',
          a: join(
            '重复元素是快排退化的主要原因之一：用 Hoare 分区 + 三数取中能显著缓解，但如果数据里重复值占比很高，更稳的做法是三路分区（Dutch national flag），把等于基准的元素一次性归位，避免反复递归。',
            code('python', [
              'import random',
              '',
              'def quick_sort(arr):',
              '    """三路分区快排：重复元素越多，优势越明显。"""',
              '    _sort(arr, 0, len(arr) - 1)',
              '    return arr',
              '',
              'def _sort(a, lo, hi):',
              '    while lo < hi:',
              '        if hi - lo < 16:            # 小区间用插入排序收尾',
              '            _insertion(a, lo, hi)',
              '            return',
              '        k = random.randint(lo, hi)  # 随机基准，杜绝最坏输入',
              '        a[lo], a[k] = a[k], a[lo]',
              '        pivot = a[lo]',
              '        lt, gt, i = lo, hi, lo',
              '        while i <= gt:',
              '            if a[i] < pivot:',
              '                a[lt], a[i] = a[i], a[lt]; lt += 1; i += 1',
              '            elif a[i] > pivot:',
              '                a[gt], a[i] = a[i], a[gt]; gt -= 1',
              '            else:',
              '                i += 1',
              '        _sort(a, lo, lt - 1)            # 只递归左侧',
              '        lo = gt + 1                     # 右侧转成循环，省一层栈',
              '',
              'def _insertion(a, lo, hi):',
              '    for i in range(lo + 1, hi + 1):',
              '        v, j = a[i], i - 1',
              '        while j >= lo and a[j] > v:',
              '            a[j + 1] = a[j]; j -= 1',
              '        a[j + 1] = v'
            ].join('\n')),
            '几个关键点：\n' +
            '- **三路分区**把相等的元素集中在中段，重复值多时复杂度接近线性；\n' +
            '- **短区间转插入排序**减少递归调用开销；\n' +
            '- **尾递归改循环**，栈深度压到 O(log n)，避免大数组触发递归上限；\n' +
            '- 随机基准保证期望复杂度，不用再担心已排序输入。\n' +
            '实测在 200 万条、重复率 60% 的整型数据上，比标准双路快排快约 2.4 倍，内存占用基本持平。'
          )
        },
        {
          q: '这个接口的 P99 到 800ms 了，帮我定位一下思路',
          a: join(
            '先别急着改代码，P99 高通常是长尾问题，得先把「慢在哪」拆开。我一般按下面顺序排查：',
            '**1. 区分是排队还是执行**\n' +
            '- 看线程池 / 连接池的等待时间。如果 waiting 占了大头，说明并发度不够或下游连接被占满，加机器没用。\n' +
            '- 对比 P50 与 P99：P50 正常而 P99 爆炸，基本可以排除算法复杂度问题。',
            '**2. 抓一次现场**\n' +
            code('bash', [
              '# 连续采样，观察热点栈',
              'pidstat -p $PID 1 10',
              'py-spy top --pid $PID --nonblocking',
              '',
              '# 或者直接 dump 火焰图',
              'py-spy record -o profile.svg --pid $PID --duration 60'
            ].join('\n')),
            '**3. 常见的三个长尾来源**\n' +
            '- 慢查询：缺索引导致偶发全表扫，命中缓存时很快；\n' +
            '- GC / 反序列化：大对象集中释放，表现为周期性尖刺；\n' +
            '- 下游超时重试：一次超时被放大成三次请求，P99 直接翻倍。',
            '先把采样结果贴出来，我们对着火焰图看是哪个环节，再决定是加缓存、调超时还是削峰。'
          )
        },
        {
          q: '把这段逻辑加上重试，但不要重试那些不该重试的异常',
          a: join(
            '重试的前提是「幂等 + 可恢复」。像参数校验失败（400）、权限不足（403）这类错误重试一万次也是同样结果，只会拖长响应时间。',
            code('python', [
              'from tenacity import (',
              '    retry, stop_after_attempt, wait_exponential_jitter,',
              '    retry_if_exception_type, before_sleep_log',
              ')',
              'import logging, httpx',
              '',
              'log = logging.getLogger(__name__)',
              '',
              '# 只对「网络抖动 / 服务端临时故障」重试',
              'RETRYABLE = (httpx.TimeoutException, httpx.NetworkError,',
              '             httpx.HTTPStatusError)  # 由下方谓词再过滤状态码',
              '',
              'def _is_transient(exc: BaseException) -> bool:',
              '    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):',
              '        return True',
              '    if isinstance(exc, httpx.HTTPStatusError):',
              '        return exc.response.status_code in (429, 502, 503, 504)',
              '    return False',
              '',
              '@retry(',
              '    reraise=True,',
              '    stop=stop_after_attempt(4),',
              '    wait=wait_exponential_jitter(initial=0.2, max=3.0),',
              '    retry=retry_if_exception_type(RETRYABLE),',
              '    before_sleep=before_sleep_log(log, logging.WARNING),',
              ')',
              'def call_upstream(payload):',
              '    resp = httpx.post(URL, json=payload, timeout=2.0)',
              '    resp.raise_for_status()',
              '    return resp.json()'
            ].join('\n')),
            '要注意三点：\n' +
            '- **指数退避 + 抖动**：避免重试风暴同时打在恢复中的下游上；\n' +
            '- **重试必须有总时长上限**：否则 4 次 × 2s 超时会把上游也拖超时；\n' +
            '- **写操作要带幂等键**，重试才能安全，否则可能重复扣款 / 重复下单。\n' +
            '如果下游是强一致写接口且不支持幂等键，正确做法是本地记录待确认状态 + 异步对账，而不是简单重试。'
          )
        }
      ]
    },

    {
      id: 'data',
      name: '数据分析（SQL / 报表）',
      topic: 'SQL 慢查询与指标口径',
      pairs: [
        {
          q: '这条 SQL 跑了 12 秒，帮我看看问题在哪',
          a: join(
            '先看执行计划，不要凭感觉加索引。用了函数或隐式转换的字段，索引会直接失效。',
            code('sql', [
              '-- 优化前：对字段做了函数运算，索引失效，全表扫',
              'SELECT * FROM orders',
              'WHERE DATE_FORMAT(created_at, \'%Y-%m\') = \'2026-09\';',
              '',
              '-- 优化后：改成范围查询，可命中 created_at 索引',
              'SELECT id, user_id, amount, created_at',
              'FROM orders',
              'WHERE created_at >= \'2026-09-01\'',
              '  AND created_at <  \'2026-10-01\';'
            ].join('\n')),
            '另外两个高频问题：\n' +
            '- `SELECT *` 拉回大量无用列，网络与反序列化开销都会上去，只取需要的字段；\n' +
            '- 深分页 `LIMIT 100000, 20` 要扫过前 10 万行，改用游标分页（`WHERE id > ? ORDER BY id LIMIT 20`）。\n' +
            '建议加一个组合索引 `(status, created_at)`，具体列顺序要看你 WHERE 条件的区分度：等值条件放前面，范围条件放后面。'
          )
        },
        {
          q: '帮我把按周汇总的报表改成环比口径，注意要展示空周',
          a: join(
            '环比最容易踩的坑是「没有数据的周直接消失」，导致趋势看起来平滑但实际是断层。正确做法是先造出完整的周序列，再左连接事实表。',
            code('sql', [
              'WITH weeks AS (               -- 生成连续周序列，保证空周也出现',
              '  SELECT generate_series(',
              '           DATE_TRUNC(\'week\', CURRENT_DATE) - INTERVAL \'11 weeks\',',
              '           DATE_TRUNC(\'week\', CURRENT_DATE),',
              '           INTERVAL \'1 week\') AS wk',
              '), agg AS (',
              '  SELECT DATE_TRUNC(\'week\', created_at) AS wk,',
              '         COUNT(*)                        AS cnt,',
              '         SUM(amount)                     AS amt',
              '  FROM orders',
              '  WHERE created_at >= CURRENT_DATE - INTERVAL \'12 weeks\'',
              '  GROUP BY 1',
              ')',
              'SELECT w.wk,',
              '       COALESCE(a.cnt, 0)  AS cnt,',
              '       COALESCE(a.amt, 0)  AS amt,',
              '       ROUND(100.0 * (COALESCE(a.amt, 0) - LAG(COALESCE(a.amt, 0))',
              '             OVER (ORDER BY w.wk))',
              '             / NULLIF(LAG(COALESCE(a.amt, 0))',
              '                      OVER (ORDER BY w.wk), 0), 2) AS wow_pct',
              'FROM weeks w',
              'LEFT JOIN agg a USING (wk)',
              'ORDER BY w.wk;'
            ].join('\n')),
            '两个口径提醒：\n' +
            '- 分母为 0 时必须显式处理成 `NULL` 而不是抛错或变成 `Infinity`，展示层再决定渲染成「—」；\n' +
            '- 周的定义要统一（自然周从周一开始还是周日），否则和业务方对不上数，这是返工最多的地方。'
          )
        },
        {
          q: '给我一个能看清分布的分组统计，平均值总感觉被大客户带偏了',
          a: join(
            '平均值对极端值极不稳健。看分布建议直接上分位数，一次把 p50 / p90 / p99 和均值并排看，偏移一目了然。',
            code('sql', [
              'SELECT tenant_id,',
              '       COUNT(*)                                              AS n,',
              '       ROUND(AVG(amount), 2)                                 AS mean,',
              '       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)   AS p50,',
              '       PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY amount)   AS p90,',
              '       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY amount)   AS p99,',
              '       ROUND(MAX(amount), 2)                                 AS max',
              'FROM orders',
              'WHERE created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
              'GROUP BY tenant_id',
              'HAVING COUNT(*) >= 30          -- 样本太小的组不参与对比',
              'ORDER BY mean DESC;'
            ].join('\n')),
            '判读方法：\n' +
            '- `mean` 明显大于 `p50` → 右偏，少数大客户在拉高均值；\n' +
            '- `p99 / p50 > 10` → 长尾很重，用均值做容量规划会低估峰值；\n' +
            '- 分组后 `p99 ≈ p50` → 该组行为高度一致，可以用均值代表。\n' +
            '如果是给业务方看，建议把 `p90` 作为主力指标、`mean` 只作参考，并明确标注口径，避免误读。'
          )
        }
      ]
    },

    {
      id: 'writing',
      name: '文档写作（周报 / 方案）',
      topic: '周报与方案润色',
      pairs: [
        {
          q: '帮我把这周的流水账周报改成结论先行的写法',
          a: join(
            '流水账的问题是读者要自己提炼重点。改成「结论 → 依据 → 下周计划」三段式，主管 10 秒就能看完。',
            '**结构模板**\n' +
            '1. **本周结论**：一句话说清结果，带数字。\n' +
            '2. **进展与依据**：只写有产出的，每条一句，附影响面。\n' +
            '3. **风险与求助**：需要别人配合的单独拎出来，不要埋在段落里。\n' +
            '4. **下周计划**：可验收的动作，不写「继续推进」这类无法判断完成的表述。',
            '**改写示例**\n' +
            '> 原文：本周跟进了订单服务巡检，看了几天的数据，跟运维沟通了几次。\n\n' +
            '> 改写：完成订单服务巡检的 3 个高频问题定位，日均异常从 14 条降至 2 条；剩余 1 项依赖运维补充日志采集权限，已同步对接人。',
            '判断标准很简单：把这段话拿给不相干的同事看，如果他能复述出「做了什么、结果如何、卡在哪」，就算合格。'
          )
        },
        {
          q: '写一份方案的风险章节，要能说服评审而不是走过场',
          a: join(
            '风险章节的作用是让评审提前做决定，不是免责声明。写法上坚持「可观测 + 有责任方 + 有触发条件」，避免「可能存在一定风险」这种无效表述。',
            '**风险条目的四要素**\n' +
            '- **触发条件**：什么情况下会出问题（量化）；\n' +
            '- **影响面**：影响哪些用户 / 多少笔交易 / 多久恢复；\n' +
            '- **应对措施**：现在就做什么，而不是出事后再说；\n' +
            '- **责任方与时限**：谁在什么时候完成。',
            '**示例条目**\n' +
            '> 风险：新计价规则上线后大促期间 QPS 峰值预计达到日常的 6 倍（约 1800 QPS），超过当前单机承载上限（1200 QPS）。\n' +
            '> 影响：若不做扩缩容，超时率将超过 5%，影响峰值时段的下单成功率。\n' +
            '> 措施：扩容至 3 副本并开启自动伸缩；上线前用压测脚本按 2 倍峰值验证，超时率需低于 1%。\n' +
            '> 责任方：XX，随上线窗口一并完成。',
            '一条能被评审通过的风险，读完应该让人知道「要不要多给资源」。如果读完没有任何决策动作，这条风险就是无效的。'
          )
        },
        {
          q: '这段技术说明太啰嗦，帮我压缩到一半篇幅',
          a: join(
            '压缩的核心是删掉「推导过程」和「显而易见」两类内容，保留结论、条件和限制。可以按下面几条规则机械地执行：',
            '1. **删掉铺垫**：「众所周知」「值得注意的是」「需要说明的是」直接去掉，句子照样成立。\n' +
            '2. **动词替代名词化**：「进行了一次优化」→「优化」；「实现了对接」→「对接完成」。\n' +
            '3. **合并同义句**：同一意思出现两次只留信息量更大的那句。\n' +
            '4. **数字带单位**：把「有了一定提升」换成「提升 18%」，读者才不需要猜。\n' +
            '5. **长句拆短**：单句超过 40 字基本可拆，中文长句的可读性衰减比英文更陡。',
            '改完之后通读一遍，检查是否还满足三个条件：**结论明确**、**前提完整**、**有可执行动作**。三者都在，篇幅短了也不影响信息量。'
          )
        }
      ]
    },

    {
      id: 'ops',
      name: '运维脚本（Docker / systemd）',
      topic: '服务部署与排障',
      pairs: [
        {
          q: '写个 systemd service，让服务挂了能自动重启，并且开机自启',
          a: join(
            '关键是 `Restart` 的策略和 `RestartSec` 的组合。`always` 会在正常退出时也重启，长驻服务通常用 `on-failure` 更稳。',
            code('ini', [
              '# /etc/systemd/system/myapp.service',
              '[Unit]',
              'Description=My App',
              'After=network-online.target',
              'Wants=network-online.target',
              '',
              '[Service]',
              'Type=simple',
              'User=app',
              'WorkingDirectory=/opt/myapp',
              'ExecStart=/opt/myapp/bin/app --config /etc/myapp/config.yaml',
              'EnvironmentFile=-/etc/myapp/env',
              'Restart=on-failure',
              'RestartSec=3',
              'StartLimitIntervalSec=60',
              'StartLimitBurst=5',
              'StandardOutput=append:/var/log/myapp/app.log',
              'StandardError=append:/var/log/myapp/app.log',
              'NoNewPrivileges=true',
              'PrivateTmp=true',
              '',
              '[Install]',
              'WantedBy=multi-user.target'
            ].join('\n')),
            '启用与验证：\n' +
            code('bash', [
              'sudo systemctl daemon-reload',
              'sudo systemctl enable --now myapp',
              'systemctl status myapp --no-pager',
              '',
              '# 验证自愈：手动杀掉进程，观察是否拉起',
              'sudo kill -9 $(systemctl show -p MainPID --value myapp)',
              'sleep 5 && systemctl is-active myapp'
            ].join('\n')),
            '注意 `StartLimitBurst`：防止配置错误导致无限重启刷爆日志，超出次数后 systemd 会停止尝试，这时候要从日志里找根因而不是加大重启次数。'
          )
        },
        {
          q: '容器里时区不对，日志时间全是 UTC，怎么改最省事',
          a: join(
            '时区问题分三层，改哪一层取决于你要影响的范围，最省事的是改运行环境而不是应用代码。',
            '**方案一：容器级（推荐）**\n' +
            code('yaml', [
              'services:',
              '  app:',
              '    image: myapp:latest',
              '    environment:',
              '      - TZ=Asia/Shanghai',
              '    volumes:',
              '      - /etc/localtime:/etc/localtime:ro      # 跟随宿主机时区',
              '      - /etc/timezone:/etc/timezone:ro'
            ].join('\n')),
            '**方案二：镜像级**（基础镜像没有 tzdata 时）\n' +
            code('dockerfile', [
              'RUN apk add --no-cache tzdata && \\',
              '    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \\',
              '    echo "Asia/Shanghai" > /etc/timezone'
            ].join('\n')),
            '三个坑：\n' +
            '- 应用内部如果硬编码了 `utcnow()`，改容器时区也不会生效，得改代码或把时区作为配置注入；\n' +
            '- 数据库连接串里的时区参数（如 `serverTimezone`）优先级高于系统时区，别漏；\n' +
            '- 日志检索一般按 UTC 存储更安全，展示层再转换，避免跨时区排查时算错时间差。'
          )
        },
        {
          q: '服务器内存只有 1.6G，怎么排查是谁在吃内存',
          a: join(
            '先建立「总量 → 分类 → 具体进程」的收敛路径，不要一上来就 `top` 乱翻。',
            code('bash', [
              '# 1. 总量：确认是否真的紧张（available 才是可用值）',
              'free -m',
              '',
              '# 2. 分类：内核页缓存 / 进程 / swap 各占多少',
              'cat /proc/meminfo | grep -E "MemTotal|MemAvailable|Cached|SwapTotal|SwapFree"',
              '',
              '# 3. 进程：按 RSS 排序取前 10',
              'ps -eo pid,ppid,rss,pmem,comm --sort=-rss | head -n 11',
              '',
              '# 4. 细分到进程内部（必要时）',
              'sudo pmap -x $(pgrep -f myapp | head -1) | tail -n 5'
            ].join('\n')),
            '判读要点：\n' +
            '- `Cached` 大不是问题，那是可回收的页缓存，看 `MemAvailable` 才准；\n' +
            '- 1.6G 这类小内存机器要特别关注 `SwapUsed` 持续增长，说明已经发生换页，性能会断崖式下降；\n' +
            '- 如果 RSS 之和远小于总量却依然紧张，通常是内核 slab 或 Docker 的 page cache 记账问题。\n' +
            '定位到具体进程后，再看它的内存增长是「阶梯式」（泄漏）还是「锯齿状」（正常 GC），两者的处置方式完全不同。'
          )
        }
      ]
    },

    {
      id: 'frontend',
      name: '前端开发（CSS / 组件）',
      topic: '前端布局与性能',
      pairs: [
        {
          q: '三栏布局，中间自适应，两侧固定宽度，最稳的写法是哪种',
          a: join(
            '现代浏览器直接上 Grid，代码量最少且没有塌陷之类的历史包袱。Flex 也能做，但要注意 `min-width: 0` 这个高频陷阱。',
            code('css', [
              '/* 方案一：Grid（推荐） */',
              '.layout {',
              '  display: grid;',
              '  grid-template-columns: 240px minmax(0, 1fr) 300px;',
              '  gap: 16px;',
              '  height: 100%;',
              '}',
              '',
              '/* 中栏必须允许收缩，否则长内容会把布局撑破 */',
              '.layout > main { min-width: 0; overflow: hidden; }',
              '',
              '/* 方案二：Flex */',
              '.layout-flex { display: flex; height: 100%; }',
              '.layout-flex > aside { flex: 0 0 240px; }',
              '.layout-flex > main  { flex: 1 1 auto; min-width: 0; }',
              '.layout-flex > .right { flex: 0 0 300px; }'
            ].join('\n')),
            '需要记住的一条规则：**在 Flex / Grid 子项里，`min-width` 的默认值是 `auto`**，意思是「不小于内容宽度」。只要中栏里有长 URL、长表格或 `pre` 代码块，布局就会被撑开，加 `min-width: 0` 才能正常收缩溢出。'
          )
        },
        {
          q: '列表有 2000 条数据，滚动卡顿，虚拟滚动值得上吗',
          a: join(
            '2000 条是否需要虚拟滚动，取决于单行的 DOM 复杂度，而不是条数本身。先量一下再决定。',
            '**先做最小成本的优化，通常就够了**\n' +
            '1. 列表容器加 `contain: layout style paint`，隔离重排影响范围；\n' +
            '2. 行内容用 `content-visibility: auto` + `contain-intrinsic-size`，浏览器自动跳过屏外渲染；\n' +
            '3. 事件用委托，别给每行绑监听；\n' +
            '4. 有图片就加 `loading="lazy"` 与固定宽高，消除布局抖动。',
            code('css', [
              '.list { contain: layout style paint; }',
              '.row {',
              '  content-visibility: auto;',
              '  contain-intrinsic-size: auto 48px;   /* 占位高度，避免滚动条跳动 */',
              '}'
            ].join('\n')),
            '如果做完这些仍然卡（一般出现在每行有图表、富文本或多层嵌套时），再上虚拟滚动。代价是要处理行高测量、锚点恢复和可访问性，属于「用复杂度换性能」的交易，不要为了 2000 行提前付出。\n' +
            '判断标准：打开 Performance 面板录一段滚动，若脚本时间低于 10ms/帧且没有长任务，就不用上虚拟滚动。'
          )
        },
        {
          q: '怎么防止打包体积越来越大，有没有能落地的约束',
          a: join(
            '体积失控几乎都是「没有度量 + 没有门槛」造成的。设一个可量化的门槛，比事后优化有效得多。',
            '**1. 可视化定位大头**\n' +
            code('bash', [
              '# Vite 项目',
              'npm i -D rollup-plugin-visualizer',
              '',
              '# 构建后生成体积报告',
              'npx vite build --mode production',
              '# 打开 dist/stats.html 查看各依赖占比'
            ].join('\n')),
            '**2. 把体积写进 CI 门槛**\n' +
            '- 对主包设硬上限（例如 gzip 后 180KB），超出即失败；\n' +
            '- 对增量设阈值（例如单次提交增长 > 10KB 需要说明），防止温水煮青蛙。',
            '**3. 最常见的三类浪费**\n' +
            '- 整包引入工具库：改成按需引入或换用原生实现（`lodash` 换成几个手写函数往往更划算）；\n' +
            '- 重复依赖：多个版本的同一个包被打进来，用 `npm ls <pkg>` 查，靠 `overrides` 收敛；\n' +
            '- 只在个别页面用的大依赖没做动态导入：改成 `import()` 拆分到独立 chunk。\n' +
            '先解决重复依赖，收益通常最大且风险最低。'
          )
        }
      ]
    }
  ];

  /* 索引：id → script */
  var byId = {};
  scripts.forEach(function (s) { byId[s.id] = s; });

  var cursor = 0;

  function resolve(id) {
    if (!id || id === 'auto') return scripts;
    return byId[id] ? [byId[id]] : scripts;
  }

  /** 取下一组伪装问答（轮换，不重复相邻） */
  function pick(id) {
    var pool = resolve(id);
    var all = [];
    pool.forEach(function (s) {
      s.pairs.forEach(function (p) { all.push({ q: p.q, a: p.a, topic: s.topic, script: s.name, id: s.id }); });
    });
    if (!all.length) return { q: '你好', a: '你好，有什么可以帮你的？' };
    var item = all[cursor % all.length];
    cursor = (cursor + 1) % all.length;
    return item;
  }

  /** 侧边栏历史：用各剧本的首个问题生成一批「最近对话」标题 */
  function historyTitles(n) {
    var titles = [];
    scripts.forEach(function (s) {
      s.pairs.forEach(function (p) { titles.push(p.q); });
    });
    var out = [];
    // 固定顺序取前 n 条，保证刷新后侧边栏稳定
    for (var i = 0; i < Math.min(n, titles.length); i++) out.push(titles[i]);
    return out;
  }

  NF.camouflage = {
    scripts: scripts.map(function (s) { return { id: s.id, name: s.name, topic: s.topic, count: s.pairs.length }; }),
    pick: pick,
    historyTitles: historyTitles,
    reset: function (offset) { cursor = offset || 0; }
  };
})(window.NovelFish);
