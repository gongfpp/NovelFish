/* ============================================================
   data/camouflage-scripts.js — 伪装对话模板库（纯数据）
   「深度思考」框里放小说，问答正文放这里的内容。

   一个剧本 = { id, name, topic, pairs: [{ q, a }] }
     · name   控制台里显示的分类名
     · topic  生成「最近对话」标题时的备选短标题
     · pairs  可轮换的问答对；q 是提问气泡，a 是回答正文（支持简易 Markdown）

   想加模板：直接往 scripts 数组里追加对象，或在已有剧本的 pairs 里加一条。
   引擎见 js/core/camouflage.js，不需要改任何代码。
   ============================================================ */
(function (NF) {
  'use strict';

  /** 包一个 Markdown 围栏代码块 */
  function code(lang, body) {
    return '```' + lang + '\n' + String(body).replace(/^\n+|\s+$/g, '') + '\n```';
  }
  /** 按空行拼接若干段落 */
  function join() {
    return Array.prototype.slice.call(arguments).join('\n\n');
  }

  var scripts = [

    /* ==========================================================
       1. 后端开发（Python）
       ========================================================== */
    {
      id: 'python',
      name: '后端开发（Python）',
      topic: 'Python 接口优化',
      pairs: [
        {
          q: '帮我写一个快速排序，要求处理大量重复元素时不要退化',
          a: join(
            '重复元素是快排退化的主要原因之一：用 Hoare 分区 + 三数取中能显著缓解，但如果数据里重复值占比很高，更稳的做法是三路分区（Dutch national flag），把等于基准的元素一次性归位，避免反复递归。',
            code('python', `
import random

def quick_sort(arr):
    """三路分区快排：重复元素越多，优势越明显。"""
    _sort(arr, 0, len(arr) - 1)
    return arr

def _sort(a, lo, hi):
    while lo < hi:
        if hi - lo < 16:            # 小区间用插入排序收尾
            _insertion(a, lo, hi)
            return
        k = random.randint(lo, hi)  # 随机基准，杜绝最坏输入
        a[lo], a[k] = a[k], a[lo]
        pivot = a[lo]
        lt, gt, i = lo, hi, lo
        while i <= gt:
            if a[i] < pivot:
                a[lt], a[i] = a[i], a[lt]; lt += 1; i += 1
            elif a[i] > pivot:
                a[gt], a[i] = a[i], a[gt]; gt -= 1
            else:
                i += 1
        _sort(a, lo, lt - 1)            # 只递归左侧
        lo = gt + 1                     # 右侧转成循环，省一层栈

def _insertion(a, lo, hi):
    for i in range(lo + 1, hi + 1):
        v, j = a[i], i - 1
        while j >= lo and a[j] > v:
            a[j + 1] = a[j]; j -= 1
        a[j + 1] = v
`),
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
            code('bash', `
# 连续采样，观察热点栈
pidstat -p $PID 1 10
py-spy top --pid $PID --nonblocking

# 或者直接 dump 火焰图
py-spy record -o profile.svg --pid $PID --duration 60
`),
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
            code('python', `
from tenacity import (
    retry, stop_after_attempt, wait_exponential_jitter,
    retry_if_exception_type, before_sleep_log
)
import logging, httpx

log = logging.getLogger(__name__)

# 只对「网络抖动 / 服务端临时故障」重试
RETRYABLE = (httpx.TimeoutException, httpx.NetworkError,
             httpx.HTTPStatusError)  # 由下方谓词再过滤状态码

def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503, 504)
    return False

@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=0.2, max=3.0),
    retry=retry_if_exception_type(RETRYABLE),
    before_sleep=before_sleep_log(log, logging.WARNING),
)
def call_upstream(payload):
    resp = httpx.post(URL, json=payload, timeout=2.0)
    resp.raise_for_status()
    return resp.json()
`),
            '要注意三点：\n' +
            '- **指数退避 + 抖动**：避免重试风暴同时打在恢复中的下游上；\n' +
            '- **重试必须有总时长上限**：否则 4 次 × 2s 超时会把上游也拖超时；\n' +
            '- **写操作要带幂等键**，重试才能安全，否则可能重复扣款 / 重复下单。\n' +
            '如果下游是强一致写接口且不支持幂等键，正确做法是本地记录待确认状态 + 异步对账，而不是简单重试。'
          )
        },
        {
          q: '异步任务里用了同步的 requests，怎么改成不阻塞事件循环',
          a: join(
            '在 `async def` 里直接调 `requests.get()` 会把整个事件循环卡住，所有并发请求一起等，表现是「QPS 上不去但 CPU 不高」。三个层次的修法，按侵入性从小到大排：',
            '**1. 换掉 HTTP 客户端（首选）**\n' +
            code('python', `
import asyncio, httpx

# 复用同一个 AsyncClient，连接池才有意义
client = httpx.AsyncClient(timeout=3.0, limits=httpx.Limits(
    max_connections=100, max_keepalive_connections=20))

async def fetch_all(urls):
    tasks = [client.get(u) for u in urls]
    return await asyncio.gather(*tasks, return_exceptions=True)
`),
            '**2. 没法换客户端：丢到线程池**\n' +
            code('python', `
import asyncio
from concurrent.futures import ThreadPoolExecutor

_pool = ThreadPoolExecutor(max_workers=32, thread_name_prefix='io')

async def fetch_sync(url):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, requests.get, url)
`),
            '**3. 判断依据**\n' +
            '- `run_in_executor` 的 `max_workers` 要给够，否则只是把阻塞从事件循环挪到了队列里，现象一样；\n' +
            '- CPU 密集型的任务不要用线程池，直接用 `ProcessPoolExecutor`，GIL 不会因为线程而消失；\n' +
            '- 排查时看 `asyncio` 的 slow callback 告警（`loop.slow_callback_duration`），能直接定位到是哪一行阻塞了。'
          )
        }
      ]
    },

    /* ==========================================================
       2. 后端开发（Java / Spring）
       ========================================================== */
    {
      id: 'java',
      name: '后端开发（Java / Spring）',
      topic: 'Spring 事务与线程池',
      pairs: [
        {
          q: '@Transactional 加了但事务没生效，怎么排查',
          a: join(
            'Spring 事务失效基本都落在「代理没生效」和「异常没抛出」这两个大类里。按下面顺序核对，能覆盖 95% 的情况：',
            '**1. 方法是不是走了代理**\n' +
            '- 同类内部直接 `this.method()` 调用不走代理，注解形同虚设；\n' +
            '- 方法是 `private` / `final` / `static` 时 CGLIB 无法覆写；\n' +
            '- 类没交给 Spring 管理（自己 `new` 出来的实例）。',
            '**2. 异常类型对不对**\n' +
            code('java', `
// 默认只回滚 RuntimeException 和 Error
// 受检异常必须显式声明
@Transactional(rollbackFor = Exception.class)
public void transfer(Long from, Long to, BigDecimal amt) {
    accountMapper.debit(from, amt);
    accountMapper.credit(to, amt);   // 抛 IOException 也会回滚
}
`),
            '**3. 常见但容易忽略的两点**\n' +
            '- 异常被自己 `catch` 掉没重新抛，事务管理器看不到失败；\n' +
            '- 传播行为写成 `REQUIRES_NEW` 后，内层提交了外层回滚，数据会不一致。\n' +
            '定位手段：把日志级别开到 `TRACE` 看 `TransactionInterceptor` 有没有打印 `Getting transaction for [...]`，没有就说明代理没进去。'
          )
        },
        {
          q: '线上线程池任务堆积，怎么判断是池太小还是任务太慢',
          a: join(
            '看两个指标就够了：**活跃线程数是否等于最大线程数**，以及**队列是否在增长**。四种组合对应四种结论，不要凭感觉调 `corePoolSize`。',
            '| 活跃线程 | 队列 | 结论 |\n' +
            '| --- | --- | --- |\n' +
            '| = max | 增长 | 池太小，或任务里有阻塞 |\n' +
            '| < max | 增长 | 任务到达速率超过消费能力 |\n' +
            '| = max | 空 | 纯计算密集，扩线程收益有限 |\n' +
            '| < max | 空 | 池够用，问题在下游 |',
            '先把参数配合理：\n' +
            code('java', `
ThreadPoolExecutor pool = new ThreadPoolExecutor(
    16, 64, 60L, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(512),              // 有界队列，避免 OOM
    new ThreadFactoryBuilder().setNameFormat("biz-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy()   // 打满时降级到调用方线程
);
`),
            '三个必须做的动作：\n' +
            '- **队列必须有界**，无界队列会把积压变成 OOM；\n' +
            '- **线程要命名**，否则 `jstack` 里全是 `pool-3-thread-7`，根本认不出业务；\n' +
            '- **拒绝策略别用 `AbortPolicy` 默认值**，线上直接抛异常比降级更糟。\n' +
            '如果是任务里有同步 IO，扩线程只能缓解，根因还是要改成异步或加超时。'
          )
        },
        {
          q: '给我一份 JVM 内存问题排查的命令清单',
          a: join(
            '按「先看是否异常 → 再看是谁占的 → 最后看为什么增长」三步走，不要一上来就 dump。',
            code('bash', `
# 1. 概况：堆、GC 次数、GC 耗时
jstat -gcutil $PID 1000 10

# 2. 谁在占：按实例数和占用排序（先执行，再触发一次 GC 更准）
jmap -histo:live $PID | head -30

# 3. 堆快照，带下来用 MAT 分析
jmap -dump:format=b,file=/tmp/heap.hprof $PID

# 4. 线程卡在哪
jstack -l $PID > /tmp/stack.txt
`),
            '判读要点：\n' +
            '- `O`（老年代占比）持续在 95% 以上且 Full GC 后不下降 → 有活对象泄漏，不是参数问题；\n' +
            '- Full GC 频繁但回收有效 → 老年代太小或晋升阈值（`MaxTenuringThreshold`）不合理；\n' +
            '- `jmap` 会 STW，务必在摘流量的节点上执行，别在高峰期跑。\n' +
            '定位到具体类以后，重点看它被谁引用：MAT 里看 `dominator_tree` 的 Retained Heap，比单纯看对象数有用得多。'
          )
        }
      ]
    },

    /* ==========================================================
       3. 算法与数据结构
       ========================================================== */
    {
      id: 'algo',
      name: '算法与数据结构',
      topic: '算法题解与复杂度',
      pairs: [
        {
          q: '滑动窗口的题我总是写错边界，有没有统一的模板',
          a: join(
            '滑动窗口的边界混乱，多半是因为「窗口定义」没先写下来。先把以下三件事定死，再动笔：**窗口里存什么**、**什么时候扩**、**什么时候缩**。',
            code('python', `
def longest_substring(s: str, k: int) -> int:
    """最长子串，其中不同字符数不超过 k。"""
    cnt = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):          # right 始终代表新纳入的元素
        cnt[ch] = cnt.get(ch, 0) + 1
        while len(cnt) > k:                 # 只在这里缩，条件写清楚
            out = s[left]
            cnt[out] -= 1
            if cnt[out] == 0:
                del cnt[out]
            left += 1
        best = max(best, right - left + 1)  # 长度公式固定：right - left + 1
    return best
`),
            '三条能解决大部分边界问题的规则：\n' +
            '- **右指针一律「先纳入再判断」**，不要先判断后纳入，那样会漏掉长度 1 的情况；\n' +
            '- **缩窗口用 `while` 而不是 `if`**，除非题目保证每次只超出 1；\n' +
            '- **长度统一写 `right - left + 1`**，不要一会儿 `right - left` 一会儿又加一。\n' +
            '写完用小样本手推一遍：空串、全相同字符、k 大于字符集大小，这三个过了基本不会错。'
          )
        },
        {
          q: '动态规划的转移方程怎么推，我每次都卡在这一步',
          a: join(
            '卡住通常是跳过了「定义状态」这一步。转移方程不是想出来的，是**从状态定义推出来的**。固定按四步走：',
            '**1. 定义状态**：一句话说清 `dp[i]` 代表什么，必须包含足够信息才能决策。\n' +
            '**2. 找最后一个决策**：想「最后一步做了什么选择」，枚举这个选择。\n' +
            '**3. 写转移**：把每个选择的结果写成 `dp` 的表达式，取最优。\n' +
            '**4. 定边界与答案**：`dp[0]` 是什么，最终答案是 `dp[n]` 还是 `max(dp)`。',
            '以「打家劫舍」为例演示这四步：\n' +
            code('python', `
def rob(nums):
    # 1. dp[i] = 只考虑前 i 间房时能偷到的最大金额
    # 2. 最后一个决策：偷第 i 间 → 不能偷 i-1；不偷第 i 间 → 保持 dp[i-1]
    # 3. dp[i] = max(dp[i-1], dp[i-2] + nums[i-1])
    # 4. 边界 dp[0] = 0, dp[1] = nums[0]；答案 dp[n]
    prev2, prev1 = 0, 0
    for v in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + v)
    return prev1
`),
            '如果第 2 步枚举不出「最后一个决策」，说明状态定义缺维度，需要补一维（例如加「是否持有」「是否以某个元素结尾」）。这是最常见的卡点，补维度后方程通常自然就出来了。'
          )
        },
        {
          q: '并查集除了连通性还能干什么，给我几个真实场景',
          a: join(
            '并查集的本质是**维护等价类**。只要问题能归结成「把一些元素合并成一类，再问两个元素是否同类」，它就能用，并且摊还复杂度接近常数。',
            code('python', `
class DSU:
    def __init__(self, n):
        self.p = list(range(n))
        self.sz = [1] * n          # 按大小合并，避免退化成链
    def find(self, x):
        while self.p[x] != x:      # 路径压缩，迭代写法不会爆栈
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.sz[ra] < self.sz[rb]:
            ra, rb = rb, ra
        self.p[rb] = ra
        self.sz[ra] += self.sz[rb]
        return True
`),
            '四个落地场景：\n' +
            '- **配置热更新的影响面分析**：把互相引用的配置项合并成一类，改一个就知道要一起刷新哪些；\n' +
            '- **账号合并 / 主副卡归并**：多个标识指向同一自然人，用并查集收成一组；\n' +
            '- **图片连通区域标记**：把相邻同色像素合并，替代递归洪水填充，不会栈溢出；\n' +
            '- **Kruskal 最小生成树**：判断加入一条边是否会成环。\n' +
            '注意它**只支持合并、不支持拆分**。如果业务里有解绑操作，要么离线倒序处理，要么换成分裂式结构。'
          )
        }
      ]
    },

    /* ==========================================================
       4. 数据分析（SQL / 报表）
       ========================================================== */
    {
      id: 'data',
      name: '数据分析（SQL / 报表）',
      topic: 'SQL 慢查询与指标口径',
      pairs: [
        {
          q: '这条 SQL 跑了 12 秒，帮我看看问题在哪',
          a: join(
            '先看执行计划，不要凭感觉加索引。用了函数或隐式转换的字段，索引会直接失效。',
            code('sql', `
-- 优化前：对字段做了函数运算，索引失效，全表扫
SELECT * FROM orders
WHERE DATE_FORMAT(created_at, '%Y-%m') = '2026-09';

-- 优化后：改成范围查询，可命中 created_at 索引
SELECT id, user_id, amount, created_at
FROM orders
WHERE created_at >= '2026-09-01'
  AND created_at <  '2026-10-01';
`),
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
            code('sql', `
WITH weeks AS (               -- 生成连续周序列，保证空周也出现
  SELECT generate_series(
           DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '11 weeks',
           DATE_TRUNC('week', CURRENT_DATE),
           INTERVAL '1 week') AS wk
), agg AS (
  SELECT DATE_TRUNC('week', created_at) AS wk,
         COUNT(*)                        AS cnt,
         SUM(amount)                     AS amt
  FROM orders
  WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
  GROUP BY 1
)
SELECT w.wk,
       COALESCE(a.cnt, 0)  AS cnt,
       COALESCE(a.amt, 0)  AS amt,
       ROUND(100.0 * (COALESCE(a.amt, 0) - LAG(COALESCE(a.amt, 0))
             OVER (ORDER BY w.wk))
             / NULLIF(LAG(COALESCE(a.amt, 0))
                      OVER (ORDER BY w.wk), 0), 2) AS wow_pct
FROM weeks w
LEFT JOIN agg a USING (wk)
ORDER BY w.wk;
`),
            '两个口径提醒：\n' +
            '- 分母为 0 时必须显式处理成 `NULL` 而不是抛错或变成 `Infinity`，展示层再决定渲染成「—」；\n' +
            '- 周的定义要统一（自然周从周一开始还是周日），否则和业务方对不上数，这是返工最多的地方。'
          )
        },
        {
          q: '给我一个能看清分布的分组统计，平均值总感觉被大客户带偏了',
          a: join(
            '平均值对极端值极不稳健。看分布建议直接上分位数，一次把 p50 / p90 / p99 和均值并排看，偏移一目了然。',
            code('sql', `
SELECT tenant_id,
       COUNT(*)                                              AS n,
       ROUND(AVG(amount), 2)                                 AS mean,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)   AS p50,
       PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY amount)   AS p90,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY amount)   AS p99,
       ROUND(MAX(amount), 2)                                 AS max
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tenant_id
HAVING COUNT(*) >= 30          -- 样本太小的组不参与对比
ORDER BY mean DESC;
`),
            '判读方法：\n' +
            '- `mean` 明显大于 `p50` → 右偏，少数大客户在拉高均值；\n' +
            '- `p99 / p50 > 10` → 长尾很重，用均值做容量规划会低估峰值；\n' +
            '- 分组后 `p99 ≈ p50` → 该组行为高度一致，可以用均值代表。\n' +
            '如果是给业务方看，建议把 `p90` 作为主力指标、`mean` 只作参考，并明确标注口径，避免误读。'
          )
        },
        {
          q: '同一批数据两张表算出来不一样，怎么定位是多对多把金额放大了',
          a: join(
            '「一对多连接导致指标翻倍」是取数对不上的头号原因。排查只要一步：**在连接前后各算一次行数和金额**，看哪个指标被放大了。',
            code('sql', `
-- 连接前：两边的真实规模
SELECT 'orders' AS t, COUNT(*) AS rows, SUM(amount) AS amt FROM orders
WHERE dt = '2026-09-27'
UNION ALL
SELECT 'refunds', COUNT(*), SUM(amount) FROM refunds WHERE dt = '2026-09-27';

-- 连接后：行数是否变多（变多就是在放大）
SELECT COUNT(*) AS joined_rows, SUM(o.amount) AS o_amt, SUM(r.amount) AS r_amt
FROM orders o
LEFT JOIN refunds r ON r.order_id = o.order_id
WHERE o.dt = '2026-09-27';
`),
            '三种修法，按推荐顺序：\n' +
            '- **先聚合再连接**：把 `refunds` 按 `order_id` 汇总成一行再 JOIN，从源头消除重复；\n' +
            '- **用半连接**：只判断存在性时用 `WHERE EXISTS (SELECT 1 ...)`，不产生笛卡尔放大；\n' +
            '- **确实要交叉明细**：明确写 `DISTINCT` 或者用窗口函数取主表一行，但要在注释里写清为什么。\n' +
            '口径文档里最好固定一句「涉及退款金额时，先按订单号聚合再关联」，能省掉大量重复排查。'
          )
        }
      ]
    },

    /* ==========================================================
       5. 数据库运维（MySQL / Redis）
       ========================================================== */
    {
      id: 'db',
      name: '数据库运维（MySQL / Redis）',
      topic: '数据库连接与锁',
      pairs: [
        {
          q: 'MySQL 出现大量 Waiting for table metadata lock，怎么处理',
          a: join(
            'MDL 的本质是**有长事务还没提交，占着元数据锁**，导致后面的 DDL 和其他查询排队。处理顺序是：找阻塞源 → 判断能否杀 → 再执行 DDL。',
            code('sql', `
-- 1. 找出阻塞链（MySQL 8.0）
SELECT waiting_pid, blocking_pid, waiting_query, blocking_query
FROM sys.innodb_lock_waits;

-- 2. 看是谁在开长事务
SELECT trx_id, trx_state, trx_started,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS seconds,
       trx_mysql_thread_id
FROM information_schema.innodb_trx
ORDER BY trx_started;
`),
            code('bash', `
# 3. 确认后再杀，先看这个连接在干什么
mysql -e "SELECT id, user, time, state, LEFT(info,80) FROM information_schema.processlist ORDER BY time DESC LIMIT 10"
mysql -e "KILL <thread_id>"
`),
            '预防比处理重要：\n' +
            '- DDL 前先设置 `lock_wait_timeout`，避免长时间挂住业务查询；\n' +
            '- 应用侧的连接池要配 `maxLifetime`，防止休眠连接带着未提交事务；\n' +
            '- ORM 的自动提交如果被关掉，一定确认每个分支都有 `commit` 或回滚。\n' +
            '注意：`KILL` 长事务会回滚它已做的修改，大事务回滚可能比执行还慢，操作前先看 `trx_rows_modified`。'
          )
        },
        {
          q: 'Redis 内存突然涨满，怎么快速定位是哪类 key',
          a: join(
            '先分辨是「数据真变多」还是「碎片 / 缓冲」造成的，两者的处理完全不同。',
            code('bash', `
# 1. 概况：内存组成、碎片率、淘汰情况
redis-cli info memory | grep -E "used_memory_human|used_memory_rss_human|mem_fragmentation_ratio|maxmemory_human|evicted_keys"

# 2. 按前缀统计 key 数量（生产环境用 scan，不要用 keys）
redis-cli --scan --pattern 'order:*' | wc -l

# 3. 采样分析大 key，找 top 10
redis-cli --bigkeys
`),
            '判读要点：\n' +
            '- `mem_fragmentation_ratio > 1.5` → 碎片严重，优先考虑重启或 `activedefrag`；\n' +
            '- `evicted_keys` 一直在涨 → 已经在淘汰数据，说明 `maxmemory` 定小了或有 key 没有过期时间；\n' +
            '- `used_memory_rss` 远高于 `used_memory` 但 key 数没涨 → 多半是客户端输出缓冲区（`client_output_buffer`）积压。\n' +
            '最常见的根因是**缓存 key 没有设 TTL**，长期累积。建议在写入侧强制 `SET key value EX 3600`，并在监控里对「无 TTL 的 key 占比」设告警，比等内存满了再处理有效得多。'
          )
        },
        {
          q: '分页查询越翻越慢，除了游标分页还有别的招吗',
          a: join(
            '深分页的本质是「数据库必须数过前面 N 行才能丢掉它们」。除了游标分页，还有三条路，各有适用边界：',
            code('sql', `
-- 方案一：延迟关联，先只用索引翻页拿主键，再回表
SELECT o.* FROM orders o
JOIN (SELECT id FROM orders WHERE status = 1
      ORDER BY id LIMIT 100000, 20) t ON t.id = o.id;

-- 方案二：覆盖索引，翻页所需的字段全部在索引里，不回表
ALTER TABLE orders ADD INDEX idx_cover (status, id, amount);
SELECT id, amount FROM orders WHERE status = 1
ORDER BY id LIMIT 100000, 20;

-- 方案三：业务侧限制，只允许前 100 页，更早的数据走导出
`),
            '选择依据：\n' +
            '- **翻页深度 < 1 万**：延迟关联见效最快，改动最小；\n' +
            '- **只需要少数字段**：加覆盖索引，效果最好；\n' +
            '- **要跳到任意页（如后台管理）**：可以接受延迟关联 + 缓存总页数；\n' +
            '- **用户端无限滚动**：直接用游标分页 `WHERE id < ?`，这是最合适的场景。\n' +
            '如果业务方坚持要「跳到第 5000 页」，先确认是不是真的有人用——这类需求十有八九是导出功能的误表达，改成异步导出能同时解决性能和体验。'
          )
        }
      ]
    },

    /* ==========================================================
       6. 前端开发（CSS / 性能）
       ========================================================== */
    {
      id: 'frontend',
      name: '前端开发（CSS / 性能）',
      topic: '前端布局与性能',
      pairs: [
        {
          q: '三栏布局，中间自适应，两侧固定宽度，最稳的写法是哪种',
          a: join(
            '现代浏览器直接上 Grid，代码量最少且没有塌陷之类的历史包袱。Flex 也能做，但要注意 `min-width: 0` 这个高频陷阱。',
            code('css', `
/* 方案一：Grid（推荐） */
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 300px;
  gap: 16px;
  height: 100%;
}

/* 中栏必须允许收缩，否则长内容会把布局撑破 */
.layout > main { min-width: 0; overflow: hidden; }

/* 方案二：Flex */
.layout-flex { display: flex; height: 100%; }
.layout-flex > aside { flex: 0 0 240px; }
.layout-flex > main  { flex: 1 1 auto; min-width: 0; }
.layout-flex > .right { flex: 0 0 300px; }
`),
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
            code('css', `
.list { contain: layout style paint; }
.row {
  content-visibility: auto;
  contain-intrinsic-size: auto 48px;   /* 占位高度，避免滚动条跳动 */
}
`),
            '如果做完这些仍然卡（一般出现在每行有图表、富文本或多层嵌套时），再上虚拟滚动。代价是要处理行高测量、锚点恢复和可访问性，属于「用复杂度换性能」的交易，不要为了 2000 行提前付出。\n' +
            '判断标准：打开 Performance 面板录一段滚动，若脚本时间低于 10ms/帧且没有长任务，就不用上虚拟滚动。'
          )
        },
        {
          q: '怎么防止打包体积越来越大，有没有能落地的约束',
          a: join(
            '体积失控几乎都是「没有度量 + 没有门槛」造成的。设一个可量化的门槛，比事后优化有效得多。',
            '**1. 可视化定位大头**\n' +
            code('bash', `
# Vite 项目
npm i -D rollup-plugin-visualizer

# 构建后生成体积报告
npx vite build --mode production
# 打开 dist/stats.html 查看各依赖占比
`),
            '**2. 把体积写进 CI 门槛**\n' +
            '- 对主包设硬上限（例如 gzip 后 180KB），超出即失败；\n' +
            '- 对增量设阈值（例如单次提交增长 > 10KB 需要说明），防止温水煮青蛙。',
            '**3. 最常见的三类浪费**\n' +
            '- 整包引入工具库：改成按需引入或换用原生实现（`lodash` 换成几个手写函数往往更划算）；\n' +
            '- 重复依赖：多个版本的同一个包被打进来，用 `npm ls <pkg>` 查，靠 `overrides` 收敛；\n' +
            '- 只在个别页面用的大依赖没做动态导入：改成 `import()` 拆分到独立 chunk。\n' +
            '先解决重复依赖，收益通常最大且风险最低。'
          )
        },
        {
          q: '页面偶发白屏，本地复现不了，线上怎么抓',
          a: join(
            '偶发白屏几乎都能归到「资源加载失败」和「运行时异常」两类，而且往往伴随用户网络差或浏览器版本老。要抓就得在**用户侧**埋点，本地复现是碰运气。',
            code('javascript', `
// 1. 资源加载失败（脚本 404、CDN 被墙都能抓到）
window.addEventListener('error', (e) => {
  const el = e.target;
  if (el && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) {
    report('resource_error', { src: el.src || el.href, tag: el.tagName });
  }
}, true);   // 必须用捕获，资源错误不冒泡

// 2. 未捕获异常
window.addEventListener('unhandledrejection', (e) => {
  report('unhandled_rejection', { reason: String(e.reason && e.reason.stack || e.reason) });
});

// 3. 白屏判定：根节点长时间为空
setTimeout(() => {
  const root = document.getElementById('app');
  if (!root || root.childElementCount === 0) {
    report('blank_screen', { ua: navigator.userAgent, url: location.href });
  }
}, 5000);
`),
            '三个判读方向：\n' +
            '- **白屏集中在某个浏览器版本** → 多半用了它不支持的语法，检查 `build.target` 是否配得过高；\n' +
            '- **集中在某些地区** → CDN 或域名被拦截，看资源错误上报的地域分布；\n' +
            '- **随机出现、报错栈指向框架内部** → 检查是不是有异步 chunk 加载失败，需要给路由做重试或降级。\n' +
            '另外务必带上 `release` 版本号和 `traceId`，否则修完无法验证，只能靠猜。'
          )
        }
      ]
    },

    /* ==========================================================
       7. 运维脚本（Docker / systemd）
       ========================================================== */
    {
      id: 'ops',
      name: '运维脚本（Docker / systemd）',
      topic: '服务部署与排障',
      pairs: [
        {
          q: '写个 systemd service，让服务挂了能自动重启，并且开机自启',
          a: join(
            '关键是 `Restart` 的策略和 `RestartSec` 的组合。`always` 会在正常退出时也重启，长驻服务通常用 `on-failure` 更稳。',
            code('ini', `
# /etc/systemd/system/myapp.service
[Unit]
Description=My App
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/app --config /etc/myapp/config.yaml
EnvironmentFile=-/etc/myapp/env
Restart=on-failure
RestartSec=3
StartLimitIntervalSec=60
StartLimitBurst=5
StandardOutput=append:/var/log/myapp/app.log
StandardError=append:/var/log/myapp/app.log
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`),
            '启用与验证：\n' +
            code('bash', `
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
systemctl status myapp --no-pager

# 验证自愈：手动杀掉进程，观察是否拉起
sudo kill -9 $(systemctl show -p MainPID --value myapp)
sleep 5 && systemctl is-active myapp
`),
            '注意 `StartLimitBurst`：防止配置错误导致无限重启刷爆日志，超出次数后 systemd 会停止尝试，这时候要从日志里找根因而不是加大重启次数。'
          )
        },
        {
          q: '容器里时区不对，日志时间全是 UTC，怎么改最省事',
          a: join(
            '时区问题分三层，改哪一层取决于你要影响的范围，最省事的是改运行环境而不是应用代码。',
            '**方案一：容器级（推荐）**\n' +
            code('yaml', `
services:
  app:
    image: myapp:latest
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - /etc/localtime:/etc/localtime:ro      # 跟随宿主机时区
      - /etc/timezone:/etc/timezone:ro
`),
            '**方案二：镜像级**（基础镜像没有 tzdata 时）\n' +
            code('dockerfile', `
RUN apk add --no-cache tzdata && \\
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \\
    echo "Asia/Shanghai" > /etc/timezone
`),
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
            code('bash', `
# 1. 总量：确认是否真的紧张（available 才是可用值）
free -m

# 2. 分类：内核页缓存 / 进程 / swap 各占多少
cat /proc/meminfo | grep -E "MemTotal|MemAvailable|Cached|SwapTotal|SwapFree"

# 3. 进程：按 RSS 排序取前 10
ps -eo pid,ppid,rss,pmem,comm --sort=-rss | head -n 11

# 4. 细分到进程内部（必要时）
sudo pmap -x $(pgrep -f myapp | head -1) | tail -n 5
`),
            '判读要点：\n' +
            '- `Cached` 大不是问题，那是可回收的页缓存，看 `MemAvailable` 才准；\n' +
            '- 1.6G 这类小内存机器要特别关注 `SwapUsed` 持续增长，说明已经发生换页，性能会断崖式下降；\n' +
            '- 如果 RSS 之和远小于总量却依然紧张，通常是内核 slab 或 Docker 的 page cache 记账问题。\n' +
            '定位到具体进程后，再看它的内存增长是「阶梯式」（泄漏）还是「锯齿状」（正常 GC），两者的处置方式完全不同。'
          )
        }
      ]
    },

    /* ==========================================================
       8. 云原生（K8s / 发布）
       ========================================================== */
    {
      id: 'k8s',
      name: '云原生（K8s / 发布）',
      topic: 'K8s 发布与排障',
      pairs: [
        {
          q: 'Pod 一直是 CrashLoopBackOff，按什么顺序看最快定位',
          a: join(
            '`CrashLoopBackOff` 只是现象，真正的原因在「上一次为什么退出」。按这个顺序看，通常三分钟能定位：',
            code('bash', `
# 1. 看上一次退出的原因和退出码（最关键的一步）
kubectl describe pod $POD -n $NS | tail -30
#    Last State: Terminated  → Reason / Exit Code 就是答案

# 2. 看上一次容器的日志（--previous 才是崩溃前的那一份）
kubectl logs $POD -n $NS --previous --tail=100

# 3. 看事件，找出调度、挂载、探针层面的问题
kubectl get events -n $NS --sort-by=.lastTimestamp | tail -20
`),
            '退出码对照：\n' +
            '- `Exit Code 1` + 日志有业务异常 → 配置错或依赖不通，看日志末段；\n' +
            '- `Exit Code 137` → 被 SIGKILL，几乎都是超过 `limits.memory` 被 OOMKilled；\n' +
            '- `Exit Code 143` → 收到 SIGTERM，多半是存活探针（liveness）连续失败被重启。\n' +
            '如果是探针误杀，检查 `initialDelaySeconds` 是否小于应用启动时间——这是最常见的误配，表现是「跑几分钟就重启一次」。'
          )
        },
        {
          q: '想给服务加优雅停机，K8s 这边要注意什么顺序',
          a: join(
            '优雅停机的核心是**先摘流量、再停进程**。顺序错了就是「已摘流量的 Pod 还在收请求」或「流量还没摘就退出了」，前者报 502，后者报 503。',
            code('yaml', `
spec:
  terminationGracePeriodSeconds: 60      # 要 > 应用自身的排空时间
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]   # 等 endpoint 摘除生效
      readinessProbe:                      # 只有就绪探针，不要用存活探针兜底
        httpGet: { path: /healthz, port: 8080 }
        periodSeconds: 5
        failureThreshold: 3
`),
            '完整链路是：\n' +
            '1. Pod 进入 `Terminating`，从 Service Endpoints 摘除；\n' +
            '2. `preStop` 执行，`sleep 5` 给 kube-proxy 和 Ingress 留出规则下发时间；\n' +
            '3. 容器收到 SIGTERM，应用停止接收新请求、处理完在途请求后退出；\n' +
            '4. 超过 `terminationGracePeriodSeconds` 还没退，直接 SIGKILL。\n' +
            '两个常见错误：`preStop` 里 `sleep` 太长导致发布变慢；以及应用把 SIGTERM 当成没收到（比如用 shell 启动导致信号没透传给子进程），这时要改成 `exec` 形式启动或加 `--init`。'
          )
        },
        {
          q: '节点磁盘快满了，怎么快速找出是谁写满的',
          a: join(
            'K8s 节点磁盘满，九成是容器日志或镜像层。按「宿主机 → 容器 → 具体文件」三层收敛：',
            code('bash', `
# 1. 宿主机层面定位大头目录
df -h
du -sh /var/lib/docker /var/lib/containerd /var/log 2>/dev/null

# 2. 容器可写层占用排行
crictl ps -a --no-trunc | head
du -sh /var/lib/containerd/io.containerd.runtime.v2.task/*/* 2>/dev/null | sort -h | tail

# 3. 容器日志（最常见元凶）
du -sh /var/log/pods/* 2>/dev/null | sort -h | tail -10

# 4. 清理（先确认再删）
crictl rmi --prune
journalctl --vacuum-size=200M
`),
            '根治手段比清理重要：\n' +
            '- 在 `kubelet` 配 `containerLogMaxSize` 和 `containerLogMaxFiles`，防止单容器日志无限增长；\n' +
            '- 应用日志同时输出 stdout 和文件时，确认没有把 stdout 重定向到文件；\n' +
            '- 给 `/var/lib/containerd` 单独挂盘，避免镜像把根分区写满拖垮整个节点。\n' +
            '注意不要直接 `rm` Pod 日志文件——容器运行时持有文件句柄，删了空间不会立刻释放，正确做法是重启容器或让 logrotate 触发。'
          )
        }
      ]
    },

    /* ==========================================================
       9. 网络与接口排障
       ========================================================== */
    {
      id: 'network',
      name: '网络与接口排障',
      topic: '网络连通性排查',
      pairs: [
        {
          q: '调用第三方接口偶发超时，怎么区分是网络还是对方的问题',
          a: join(
            '偶发超时必须拿到**分段耗时**才能下结论。只测总时长永远说不清是谁的问题。',
            code('bash', `
# 1. 分段耗时：DNS / TCP / TLS / 首字节 各花了多久
curl -o /dev/null -s -w '
dns:    %{time_namelookup}s
tcp:    %{time_connect}s
tls:    %{time_appconnect}s
ttfb:   %{time_starttransfer}s
total:  %{time_total}s
code:   %{http_code}
' https://api.example.com/health

# 2. 连测 50 次，看长尾分布而不是平均值
for i in $(seq 50); do
  curl -o /dev/null -s -w "%{time_total} %{http_code}\n" https://api.example.com/health
done | sort -n | tail -10

# 3. 抓包确认到底哪一段慢（重传 = 网络；无响应 = 对方）
sudo tcpdump -i any -nn -w /tmp/api.pcap host api.example.com and port 443
`),
            '判读规则：\n' +
            '- **`time_namelookup` 高** → DNS 慢，本地缓存或换解析服务；\n' +
            '- **`time_connect - time_namelookup` 高** → TCP 握手慢，网络链路或对方 SYN 队列满；\n' +
            '- **`time_appconnect - time_connect` 高** → TLS 协商慢，常见于证书链不全需要多次往返；\n' +
            '- **`time_starttransfer` 高但前面都正常** → 请求已到达对方，是服务端处理慢，这时候提工单才站得住。\n' +
            '抓包导进 Wireshark 看 `tcp.analysis.retransmission`，如果重传集中在某些时间点，配合 `mtr` 看是不是中间某跳丢包。'
          )
        },
        {
          q: '内网两台机器互相不通，有没有固定套路',
          a: join(
            '网络不通要按 OSI 自下而上分层排除，跳层排查只会浪费时间。固定按这五步走：',
            code('bash', `
# 1. 链路：网卡是否 UP，有没有 IP
ip -br addr

# 2. 同网段：ARP 能不能解析到对方
ip neigh show | grep <peer_ip>

# 3. 路由：去对方的下一跳是谁
ip route get <peer_ip>

# 4. 三层可达性：ICMP 常被禁，别用它下结论，改用 TCP 探测
nc -vz -w 2 <peer_ip> <port>
timeout 3 bash -c "echo > /dev/tcp/<peer_ip>/<port>" && echo open || echo closed

# 5. 本地有没有在监听 / 防火墙有没有放行
ss -lntp | grep <port>
iptables -S | head -20
`),
            '每层对应的典型结论：\n' +
            '- ARP 解析不到 → 不在同一广播域，或 VLAN 配错；\n' +
            '- `ip route get` 走的是默认网关而不是直连 → 掩码配错，这是最隐蔽也最常见的一种；\n' +
            '- `nc` 不通但 `ss` 显示在监听 → 防火墙或安全组；\n' +
            '- 都正常但业务仍失败 → 问题在应用层，回去看服务日志。\n' +
            '注意在容器环境里还要多查一层：容器自己的网络命名空间、以及 Service Mesh 的 sidecar 是否拦截了流量。'
          )
        },
        {
          q: '网站 HTTPS 证书链不全，只有部分客户端报错，怎么验证和修',
          a: join(
            '证书链不全的症状非常典型：**浏览器和 curl 正常，但 Java、Android 老版本、部分 SDK 报 `unable to find valid certification path`**。原因是这些客户端不主动下载中间证书。',
            code('bash', `
# 1. 看服务端到底下发了几个证书（只有一个就是链不全）
echo | openssl s_client -connect example.com:443 -showcerts 2>/dev/null \\
  | grep -c "BEGIN CERTIFICATE"

# 2. 用不带系统信任库的方式验证，能复现客户端失败
echo | openssl s_client -connect example.com:443 -CApath /dev/null 2>&1 | grep -E "Verify return code|verify error"

# 3. 修复：服务端证书文件按「服务器证书 → 中间证书 → 根证书」顺序拼接
cat server.crt intermediate.crt > fullchain.crt
`),
            code('nginx', `
ssl_certificate     /etc/nginx/ssl/fullchain.crt;   # 必须是拼接后的完整链
ssl_certificate_key /etc/nginx/ssl/server.key;
ssl_protocols       TLSv1.2 TLSv1.3;
`),
            '验证一定要用**真实客户端**跑一遍，不能只看 `openssl`：\n' +
            '- Java 用 `keytool -printcert -sslserver example.com:443`；\n' +
            '- Android 7 以下和部分 IoT 设备不认 Let\'s Encrypt 的新根，需要显式带上中间证书；\n' +
            '- 修完先灰度，证书链改动会影响所有客户端，回滚成本比想象中高。'
          )
        }
      ]
    },

    /* ==========================================================
       10. 大模型应用（RAG / Prompt）
       ========================================================== */
    {
      id: 'ai',
      name: '大模型应用（RAG / Prompt）',
      topic: 'RAG 与 Prompt 调优',
      pairs: [
        {
          q: 'RAG 检索出来的内容不相关，从哪几个环节调最有效',
          a: join(
            'RAG 效果差要分清是**召回问题**还是**排序问题**。方法很简单：把 top-k 调大到 50，人工看正确答案在第几名。',
            '**判断表**\n' +
            '- 正确答案压根不在 top-50 → 召回问题，问题在切分或向量模型；\n' +
            '- 在 top-50 但不在 top-5 → 排序问题，加 rerank 就能解决大半；\n' +
            '- 在 top-5 但模型答错 → 生成问题，改 Prompt 或换更强的模型。',
            code('python', `
# 召回问题最常见的两个根因
# 1) 切分太大，一段里混了多个主题，向量被平均掉
splitter = RecursiveCharacterTextSplitter(
    chunk_size=400, chunk_overlap=80,        # 中文场景 300-500 字比较合适
    separators=["\\n\\n", "\\n", "。", "；", "，"],
)

# 2) 只用向量检索，专有名词（订单号、错误码）匹配不到
#    改成混合检索：向量 + BM25，再融合
from langchain.retrievers import EnsembleRetriever
retriever = EnsembleRetriever(
    retrievers=[vector_retriever, bm25_retriever],
    weights=[0.6, 0.4],
)
`),
            '落地顺序建议：\n' +
            '1. **先加 rerank**（Cross-Encoder），改动最小、收益最大；\n' +
            '2. **再调切分粒度**，中文按标点切、控制 300-500 字；\n' +
            '3. **最后上混合检索**，处理专有名词和精确匹配；\n' +
            '4. 如果业务术语多，考虑加一份同义词表做查询改写，比换 embedding 模型便宜得多。\n' +
            '另外务必建一个 20-50 条的人工标注评测集，否则每次调参都只能凭感觉，改好一处坏一处。'
          )
        },
        {
          q: '怎么写系统提示词，让模型稳定输出固定格式的 JSON',
          a: join(
            '靠「请输出 JSON」是不稳的。要让格式稳定，需要三件事同时做到：**给 schema**、**给正例**、**给兜底**。',
            code('python', `
system = """你是一个结构化信息抽取器。

## 输出要求
只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。

## Schema
{
  "name":   string,          // 人名，未提及则为空字符串
  "amount": number,          // 金额，单位元，未提及为 0
  "tags":   string[]         // 标签，最多 3 个
}

## 示例
输入：张三昨天转了 500 元买书
输出：{"name":"张三","amount":500,"tags":["转账","购书"]}
"""

# 能约束就约束，不要指望模型自觉
resp = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "system", "content": system},
              {"role": "user", "content": user_input}],
    response_format={"type": "json_object"},   # 结构化输出
    temperature=0,                              # 抽取任务不要随机性
)
`),
            '还有三条实践反馈：\n' +
            '- **字段尽量少**，一次抽 15 个字段的准确率会断崖式下降，拆成多次调用更稳；\n' +
            '- **枚举值要在 Prompt 里列全**，模型不会自己发明一致的取值；\n' +
            '- **空值语义要写清楚**（空字符串还是 null），否则后续解析会一直报错。\n' +
            '最后解析端一定要包 try/except 并记录原始输出，线上偶发的格式错误靠日志回溯，不要靠重试硬扛。'
          )
        },
        {
          q: 'prompt 改了以后效果时好时坏，怎么系统性地评估',
          a: join(
            '「时好时坏」几乎都是**没有评测集**导致的。凭单条 case 调 Prompt，必然在修好 A 的同时弄坏 B。',
            '**最小可用的评测流程**\n' +
            '1. 攒 30-50 条真实 case，覆盖简单、边界、易错三类；\n' +
            '2. 给每条标一个期望结果，或者用 LLM 当裁判打分（要有评分标准）；\n' +
            '3. 每次改 Prompt 全量跑一遍，看整体通过率而不是个别样例。',
            code('python', `
def run_eval(prompt, cases, judge_model):
    passed = 0
    for c in cases:
        out = call(prompt, c["input"])
        verdict = judge(
            question="回答是否满足以下标准：\\n" + c["criteria"],
            answer=out, model=judge_model,
        )
        passed += int(verdict["pass"])
    return passed / len(cases)
`),
            '四个容易忽略的点：\n' +
            '- **裁判模型别用被评的同一个模型**，否则会系统性偏袒；\n' +
            '- **`temperature=0`**，否则同一输入两次结果不同，评测没有意义；\n' +
            '- **记录版本号**，Prompt 和结果一起存，否则出了问题无法回滚；\n' +
            '- **区分「格式错」和「内容错」**，前者能靠解析约束修，后者才需要改 Prompt。\n' +
            '有条件的话把评测挂到 CI 上，Prompt 改动走 MR，通过率下降超过阈值就拦住。'
          )
        }
      ]
    },

    /* ==========================================================
       11. 测试与质量
       ========================================================== */
    {
      id: 'test',
      name: '测试与质量',
      topic: '接口测试与用例设计',
      pairs: [
        {
          q: '接口测试用例总是漏场景，有没有能照着走的设计方法',
          a: join(
            '漏场景基本是因为「凭经验想」。用**等价类 + 边界值 + 正交**这套组合，可以机械地把场景穷举出来，不依赖个人经验。',
            '**第一步：列出所有入参，逐个划分等价类**\n' +
            '| 参数 | 有效等价类 | 无效等价类 |\n' +
            '| --- | --- | --- |\n' +
            '| 金额 | 0.01 ~ 50000 | 负数、0、超上限、非数字 |\n' +
            '| 账号 | 已存在的有效账号 | 不存在、已注销、被冻结 |\n' +
            '| 幂等键 | 32 位以内字符串 | 空、超长、重复 |',
            '**第二步：取边界值**\n' +
            '对每个范围取「下界、下界-1、上界、上界+1」四个点，这一条能抓住绝大多数越界 bug。',
            '**第三步：正交组合，别做笛卡尔积**\n' +
            code('text', `
正交表 L9(3^4) 示例：4 个参数各 3 个取值，只需 9 条用例
而不是 3^4 = 81 条

A  B  C  D
1  1  1  1
1  2  2  2
1  3  3  3
2  1  2  3
2  2  3  1
2  3  1  2
3  1  3  2
3  2  1  3
3  3  2  1
`),
            '**第四步：补非功能维度**\n' +
            '- 并发：同一订单并发扣款，验证幂等与锁；\n' +
            '- 顺序：先提交后查询 vs 先查询后提交；\n' +
            '- 异常：下游超时、返回格式错乱、部分成功。\n' +
            '按这四步走，一个接口的用例通常落在 25-40 条，既能覆盖又不会爆炸。'
          )
        },
        {
          q: '写自动化用例时，怎么处理第三方依赖才稳定',
          a: join(
            '自动化用例不稳定的头号原因是**真实依赖不受控**。原则是：单元级全 Mock，集成级用契约测试，只有冒烟层才打真实依赖。',
            code('python', `
# 单元测试：把外部依赖替换掉，只测自己的逻辑
def test_apply_limit_rejects_when_over_threshold(mocker):
    mocker.patch("svc.risk.query_score", return_value=90)     # 不查真实风控
    mocker.patch("svc.repo.save", return_value=None)
    result = apply_limit(user_id=1, amount=100000)
    assert result.code == "REJECT_OVER_THRESHOLD"
`),
            '三层策略：\n' +
            '- **单元层**：全部 Mock，用固定桩数据，追求毫秒级和确定性；\n' +
            '- **集成层**：用 Testcontainers 起真实 MySQL/Redis，但不用真实的第三方 HTTP 服务；对第三方用 WireMock 回放录制好的响应；\n' +
            '- **冒烟层**：只在预发环境打真实依赖，用例少而精，失败就阻断发布。',
            '四个稳定性要点：\n' +
            '- **时间要可注入**，不要在业务里直接读 `now()`，否则跨天、跨月必挂；\n' +
            '- **不要依赖执行顺序**，每条用例自己准备和清理数据；\n' +
            '- **随机数用固定种子**，否则偶发失败无法复现；\n' +
            '- **断言业务结果而不是断言 SQL 条数**，后者一改实现就崩。\n' +
            '如果某条用例连续两周出现「重跑就过」，直接标记并排查，不要靠重试掩盖——那是在养一个定时炸弹。'
          )
        },
        {
          q: '线上出了一个 bug，怎么补测试才不会再犯',
          a: join(
            '补测试的目标不是「覆盖这行代码」，而是**让同类 bug 无法再通过**。按这个顺序做效果最好：',
            '**1. 先写一条能复现 bug 的失败用例**\n' +
            '用出问题的真实入参（脱敏后），确认它在修复前是红的。如果写不出失败的用例，说明还没真正理解 bug 的触发条件。',
            '**2. 修复，让用例转绿**\n' +
            '顺序不能反。先改代码再补测试，很容易写出「顺着实现写的测试」，它永远通过但抓不到问题。',
            '**3. 找同类风险点，补边界用例**\n' +
            '例如 bug 是「金额刚好等于上限时判错」，那就要把「上限-1、上限、上限+1」三条一起补上，而不是只补出错的那一个点。',
            '**4. 判断要不要加防线**\n' +
            '- 数据类 bug → 加数据校验或数据库约束；\n' +
            '- 配置类 bug → 加启动时的配置检查（fail fast）；\n' +
            '- 边界类 bug → 加属性测试（Hypothesis / jqwik）自动生成边界组合。',
            '最后在 commit message 里带上问题单号和触发条件。半年后有人再动这块代码时，测试名称和注释就是最好的说明书——「测试为什么存在」比「测试做了什么」重要得多。'
          )
        }
      ]
    },

    /* ==========================================================
       12. 文档写作（周报 / 方案）
       ========================================================== */
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
        },
        {
          q: '给领导写一份上线通知，既要专业又不能有歧义',
          a: join(
            '上线通知最容易出问题的地方是「时间」和「影响面」写得不明确，导致接收方自己理解。模板固定成五段，每一段只回答一个问题：',
            '**1. 什么时候（时间要带时区和具体分钟）**\n' +
            '> 2026 年 9 月 30 日 22:00 - 23:30（GMT+8）。\n\n' +
            '**2. 做什么（一句话，不要写实现细节）**\n' +
            '> 订单服务发布 2.4.0 版本，新增批量导出能力。\n\n' +
            '**3. 有没有影响（明确说「有」还是「无」，不要写「基本无影响」）**\n' +
            '> 发布期间订单查询接口预计不可用 2 分钟，其余接口无影响。\n\n' +
            '**4. 需要谁配合（点名到人，不要写「请相关同事」）**\n' +
            '> 请运维 XX 在 21:50 前完成数据库备份确认。\n\n' +
            '**5. 出问题找谁（带联系方式，并说明回滚时限）**\n' +
            '> 异常联系 XX（分机 / 手机）；23:00 前未恢复将执行回滚，回滚预计 10 分钟。',
            '三个必须避免的写法：\n' +
            '- 「择期上线」「近期上线」——没有具体时间的通知等于没发；\n' +
            '- 「可能会有短暂影响」——接收方无法据此安排工作；\n' +
            '- 只写成功路径，不写回滚方案——评审时会被直接打回。'
          )
        }
      ]
    },

    /* ==========================================================
       13. 产品与需求（PRD）
       ========================================================== */
    {
      id: 'product',
      name: '产品与需求（PRD）',
      topic: '需求拆解与 PRD',
      pairs: [
        {
          q: '业务方说「要加个审核功能」，怎么把它拆成能开发的需求',
          a: join(
            '「加个审核」不是需求，是一句话诉求。要拆成可开发的条目，必须补齐**状态机、角色、时序、异常**四个维度。缺一个，开发过程中必然返工。',
            '**1. 状态机：把状态和流转画全**\n' +
            code('text', `
草稿 ──提交──→ 待审核 ──通过──→ 已生效
                 │
                 ├──驳回──→ 已驳回 ──重新编辑──→ 草稿
                 └──撤回──→ 草稿
`),
            '**2. 角色与权限**\n' +
            '| 角色 | 可见状态 | 可执行动作 |\n' +
            '| --- | --- | --- |\n' +
            '| 提交人 | 全部自己提交的 | 提交、撤回、重新编辑 |\n' +
            '| 审核人 | 待审核 + 自己审过的 | 通过、驳回 |\n' +
            '| 管理员 | 全部 | 全部 + 强制生效 |',
            '**3. 时序与并发**：同一单据能否被两个审核人同时打开？后提交的怎么办（乐观锁版本号 / 先到先得）？\n' +
            '**4. 异常分支**：审核人离职、超时未审（自动通过还是升级）、提交后数据被删。这三条不写清，上线必踩。',
            '补完之后还要做一件事：**给每条需求写验收标准**，格式统一成「给定…当…则…」。没有验收标准的需求，开发和测试对「做完了」的理解一定不一致。'
          )
        },
        {
          q: '排期总被质疑拍脑袋，怎么让工作量估算更有说服力',
          a: join(
            '估算被质疑，通常是因为只给了一个数字，没有给**前提和不确定性**。改成「三点估算 + 明确假设」的形式，说服力会完全不同。',
            '**三点估算（PERT）**\n' +
            '| 项 | 说明 |\n' +
            '| --- | --- |\n' +
            '| O（乐观） | 一切顺利、无阻塞 |\n' +
            '| M（最可能） | 正常情况下的期望 |\n' +
            '| P（悲观） | 遇到已知风险全部命中 |\n\n' +
            '期望工期 = (O + 4M + P) / 6',
            '**必须一并写出的假设**\n' +
            '1. 接口文档在开工前定稿，变更走变更流程；\n' +
            '2. 测试环境可随时使用，不与其他团队排队；\n' +
            '3. 不包含 UAT 反馈的修改轮次（单独预留 20%）。',
            '**关键在「显式列出不确定性」**\n' +
            '- 哪些地方依赖外部团队，他们什么时候能给；\n' +
            '- 哪些技术点还没验证过，需要先做 1 天技术预研；\n' +
            '- 历史上的同类需求平均超期多少（用数据说话最有力）。',
            '最后一招很管用：把「乐观值」和「悲观值」都报出去，让决策方自己选。只报一个数字，等于把所有不确定性风险都扛在自己身上。'
          )
        },
        {
          q: '用户反馈某个功能难用，但说不清哪里难用，怎么办',
          a: join(
            '「难用」是结论，不是原因。要做的是把模糊感受转换成**可观测的行为数据**，再定位到具体环节。',
            '**第一步：拆解漏斗，找流失点**\n' +
            code('text', `
进入页面 1000 人
  ↓ 92%   点击「开始」
填写表单  920 人
  ↓ 41%   ← 明显异常，重点看这里
提交成功  377 人
`),
            '**第二步：定位到具体字段**\n' +
            '- 埋每个字段的**聚焦次数**和**修改次数**：反复修改 = 提示不清；从未聚焦 = 不知道该填；\n' +
            '- 记录**报错分布**：如果 80% 的错误集中在某一个校验，那就是规则本身有问题。',
            '**第三步：用 5 个用户做可用性测试**\n' +
            '不需要大样本。给 5 个人同一个任务，只说目标不说步骤，观察他们在哪里停顿、犹豫、点错。会发现的问题高度一致。',
            '**第四步：区分三类原因**\n' +
            '- **认知问题**：不知道要做什么 → 改文案和引导；\n' +
            '- **操作问题**：知道要做什么但很麻烦 → 改交互和默认值；\n' +
            '- **能力问题**：功能本身没有 → 补功能。\n' +
            '这三类的解法完全不同，判断错方向就会出现「改了三个月用户还是说难用」。'
          )
        }
      ]
    }

  ];

  NF.data = NF.data || {};
  NF.data.camouflageScripts = scripts;
})(window.NovelFish);
