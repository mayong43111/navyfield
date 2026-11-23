# 自动化测试

从项目根运行 `npm test`。Node.js 22.18+ 递归匹配 tests 下的 `.test.mjs`，不会因为分类移动而漏跑。

- simulation：弹仓、导航、弹道、散布、伤害、出生、沉没，以及无 DOM/Three 的固定步会话、种子重演、只读边界和同时击沉。
- content：官网解析与四舰 GLB、炮口、尺寸和外形语义；数值炮口与真实模型契约比对、冻结后模型/镜头独立性。
- ui：泊位、舰型匹配、准备状态、海图和镜头；键盘命令、弹仓命令边界和五秒结算显示。
- game：冻结港口观察、独立泊位配装、失败指令原子性、真实本地会话指令路由、后台暂停、退出弹仓转移及失败出击保留当前会话。
- integration：Git 白名单、精简匹配清单和署名打包。
- [balance/test_balance.py](balance/test_balance.py)：独立目标数值的Python标准库测试；不由 `npm test` 运行。在工作区虚拟环境执行 `python -m unittest discover -s tests/balance -p 'test_*.py' -v`，另用 `python tools/balance/run.py --verify` 验证11个生成基线；包含炮位/能力/控制分离、两用炮共享状态和手动防空对照；完整步骤见[数值说明](../design-data/README.md)。
- [balance/test_controls.py](balance/test_controls.py)：操作修订1的11项测试；覆盖全舰数量、逐管装填、AP/HE能力约束、渐次等持续射速、选组/射击方式不重置、自动停火/重锁、非法命令与航空/鱼雷边界。与balance测试用同一unittest discover命令运行，共44项（含模型审计来源和下载阻断状态校验）；`python tools/balance/controls.py --verify`另验证确定性[状态回放](../design-data/reports/weapon-controls.json)，不当作新的AA击落实验。
- [content/target-content.test.mjs](content/target-content.test.mjs)：统一目标JSON解析/字段与数值独立性。
- [simulation/target-battle.test.mjs](simulation/target-battle.test.mjs) / [target-weapons.test.mjs](simulation/target-weapons.test.mjs)：12舰、模式/共享状态、自动副炮/AA、鱼雷、航空、固定种子与旧内核分派。
- [ui/target-runtime.test.mjs](ui/target-runtime.test.mjs)：12舰港口出击/退出、航母不伪造主炮弹仓、手动两用/自动分类、共享库存标签、渐次释放与缺模型标记。
- [content/original-ships.test.mjs](content/original-ships.test.mjs) / [original-runtime.test.mjs](content/original-runtime.test.mjs)：8原创模型的确定性生成、统一视觉源、有限几何、炮座/炮口层级、手动/自动身份、独立克隆、辅助朝向/AA仰角与12资源哈希；发布测试覆盖12舰署名及Git白名单。节点测试不等于画面验收。
- 本轮Node完整回归115项通过；此前Python44项通过且本轮数值/报告逐字节验证不变。生产构建通过，按用户要求浏览器验收后置（此前Chromium缺系统库）。限制见[运行说明](../docs/game-design/runtime-target.md)。
- [performance](performance/README.md)：未来基准。
- [fixtures](fixtures/README.md)：合法的小型测试输入约定。

保留原有 57 项回归，并增加阶段一及资源读取验证；测试数量以 `npm test` 输出为准。游戏内容测试读取 content，不依赖 research；无需原始下载即可执行。原始文件完整性由本地模型索引另行检查，不作为公开 CI 输入。
