# 数值设计

- [source](source/README.md)：唯一可编辑的自研数值输入。
- [experiments](experiments/README.md)：参数试算与比较。
- [reports](reports/README.md)：生成的评估结果。

默认使用 UTF-8 CSV 编辑数值，再由工具生成经过校验的 JSON；复杂嵌套结构可选 JSON，但同一张表只能有一个编辑真值。记录单位、版本、来源和引用 ID。

已建立独立目标规则 `target-v1.3.0`（schema 3）：首版8艘、三期共12艘；十一张CSV编辑表、四张实验表、Python标准库校验/规范化/试算流水线。新增[控制配置](source/controls.csv)与[武器能力模式](source/weapon_modes.csv)，分离炮位/能力/控制；弗莱彻原4管主炮增加手动两用防空，BB现控制与火力不变。新增6个[手动防空场景](experiments/manual_aa_scenarios.csv)，生成18条自动/手动/合用对照，假设与限制见[炮组分类说明](../docs/game-design/weapon-controls.md)。仅AP/HE炮弹与独立鱼雷，补充自动近防副炮/分层防空及每舰真实舰名和模型来源；重巡采用希佩尔4座双联装。v1.2.1将127/152级副炮射程缩为600/550u、纵横散布扩大50%，只削弱自动对舰近防，主炮与防空不变。v1.2.2只将三艘BB对舰副炮数量减少1/3，全舰分别4/8/4管，巡洋舰与航母不变。v1.2.3将全部防空射程缩为1200/600u，命中概率降低20%，保留数量、射速与单弹伤害，不改对舰火力。[traits.csv](reports/target-v1/traits.csv)给出每舰量化对照与统一靶标结果；[自动火炮设计](../docs/game-design/automatic-weapons.md)包含绕行DD开关对照和逐机击落，[模型核实清单](../docs/game-design/ship-models.md)区分四种已有外形与八个候选、公开许可与上游权利待核。完整玩法见[目标数值设计](../docs/game-design/balance-target.md)，结果见[生成报告](reports/target-v1/balance-report.md)。

在仓库根目录用工作区Python虚拟环境运行（无需第三方依赖）：

```sh
python3 -m venv .venv
.venv/bin/python tools/balance/run.py --check
.venv/bin/python -m unittest discover -s tests/balance -p 'test_*.py' -v
.venv/bin/python tools/balance/run.py
.venv/bin/python tools/balance/run.py --verify
```

Windows使用 `.venv\Scripts\python.exe`。`--output`可指定隔离试验输出；基线Python版本为3.12.3，`--verify`按同版本逐字节比较11个产物。只改CSV后重生成，不手改报告JSON。

最终[炮组操作规则](../docs/game-design/weapon-controls.md)修订1保持原数值版本/输入和11个报告不变；另用虚拟环境的`python tools/balance/controls.py`生成[操作状态回放](reports/weapon-controls.json)，追加`--verify`逐字节验证。它覆盖选炮位/炮座、用途/AP/HE、齐射/渐次共享逐管状态与自动启停，不替代弹道/蒙特卡洛试算；这些操作现已接入目标内核与界面。模型审计变更后重新生成报告，完整输入哈希变化，但8张数值CSV逐字节不变。

## 运行数值导出

目标12舰、主炮/鱼雷/航空、自动副炮/小AA与弗莱彻手动两用已经接入当前游戏。统一舰船运行数值在[content/data/ships/target.json](../content/data/ships/target.json)，由[export-runtime.py](../tools/balance/export-runtime.py)导出，不手改。运行JSON只包含10张数值源表，不包含模型研究或实验；模型审计变更不改变运行数值哈希。

```sh
.venv/bin/python tools/balance/export-runtime.py
.venv/bin/python tools/balance/export-runtime.py --verify
npm test
npm run build
```

详细模块职责、操作、补给与验收限制见[运行接入说明](../docs/game-design/runtime-target.md)。仍为单机1对1，未实现全舰队、占点、修理、存档或联机。官网原始 CSV/JSON 继续保留在 research，兼容副本在 content/data/legacy；不再是当前目标模拟真值。
