# 数值报告

用于命中分布、伤害、航行和任务难度的生成结果，注明输入版本、场景、种子、Python版本与输入SHA-256。

本次审核基线 [target-v1](target-v1/balance-report.md) 的11个产物通过Git显式白名单保留，其他临时报告仍默认忽略：

- [balance-report.md](target-v1/balance-report.md)：中文舰船、炮伤/对射、房间与其他机制结果。
- [normalized.json](target-v1/normalized.json)：校验后的规范化数据，非运行内容，不手工编辑。
- [summary.json](target-v1/summary.json)：元数据与完整精度的全部结果。
- [traits.csv](target-v1/traits.csv)：逐舰定位、优势与代价、机动/耐久/主副武器指标，以及统一1000u重巡靶标的HE命中率与期望DPS；后续航空不伪装成炮击试算。
- [gunnery.csv](target-v1/gunnery.csv)：命中与95%区间、每命中伤害、期望DPS/能量TTK。
- [duels.csv](target-v1/duels.csv)：离散主炮对射胜负、同沉、超时、已决中位/P90。
- [rooms.csv](target-v1/rooms.csv)：开战至首射/首轮到达、双方入射程、完整准备预算。
- [extra.csv](target-v1/extra.csv)：火灾/维修/转向/占点及后续雷/航空解析值，meaning标明每列语义。

- [automatic-surface.csv](target-v1/automatic-surface.csv)：18条BB对圆周DD的自动副炮开关对照，击沉/未决、中位时间与双方伤害；secondary_hits为发射时预判命中（包含结束时仍在途炮弹），实际扣血以mean_dd_damage为准。
- [automatic-air.csv](target-v1/automatic-air.csv)：8条自动分层AA的逐机伤害/击落/投弹前生存试算；aa_hits包括预判命中但未到达或目标已死的炮弹，不能直接换算击落数。

- [manual-air.csv](target-v1/manual-air.csv)：18条弗莱彻主炮手动防空与自动小口径防空组合对照；明确误差档、高度、间距、击落/生存/投弹伤害；manual_effective_hits是已爆炸命中存活飞机的事件，不是发射时预判命中。与旧automatic-air起点和布局不同，不直接相减；参数与边界见[炮组分类说明](../../docs/game-design/weapon-controls.md)。traits新增主/第二武器显式控制与开放模式、小口径控制，secondary并不总是副炮。

另外保留[weapon-controls.json](weapon-controls.json)：操作修订1的4组确定性命令/资源回放，独立于target-v1的11个数值产物；记录原数值版本、CSV输入SHA256、发射炮管和共享状态。用`python tools/balance/controls.py`生成、追加`--verify`复现，不包含渐次防空击落或真人操作结果，规则见[操作设计](../../docs/game-design/weapon-controls.md)。

模型审计更新后已重生成元数据/模型资料，完整输入SHA-256变化，8张数值CSV逐字节不变；运行数值哈希排除模型表，不受影响。当前实际玩法范围见[运行说明](../../docs/game-design/runtime-target.md)，修理/占点离线结果不是已实现功能。

报告不是编辑源。更改[source](../source/README.md)或[实验输入](../experiments/README.md)后重生成；`--verify`临时重算并逐字节比较，失败说明报告过期或Python版本不同。执行方式与局限见[设计说明](../../docs/game-design/balance-target.md)。
