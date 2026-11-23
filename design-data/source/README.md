# 数值编辑源

目标规则 `target-v1.3.0` 的唯一可编辑数值真值，全部UTF-8 CSV。版本与全局参数见[rules.csv](rules.csv)，每行保留稳定ID与自研来源；不将官网缺失字段编造为史实。报告JSON用于离线复现；目标运行JSON统一导出到 `content/data/ships/target.json`，不手改、不覆盖旧legacy数据。维护流程见[运行说明](../../docs/game-design/runtime-target.md)。

| 表 | 内容与字段单位 |
|---|---|
| [ships.csv](ships.csv) | 12种舰型；phase=1主炮/2雷击/3航空；HP与bulge_hp为耐久；length/beam/turn_radius为u；speed/initial_speed为u/s；acceleration为u/s²；main/secondary_mounts与barrels为炮座和每座管数（CV为编队和每队飞机数）；删除手填aa_dps，小口径自动防空由明确炮组推导，主炮手动防空由模式另算；仅航空期启用；aircraft_capacity为总机库存 |
| [weapons.csv](weapons.csv) | 10种舰炮配置（6口径+速射/精度与2种自动副炮变体）、2雷、2航空、2种防空炮；reload_s为装填/准备秒数；muzzle_u_s为炮口初速；max_elevation_deg为度；damage为每弹/每雷/每机攻击HP；penetration_mm为抽象厚度；ammo_per_barrel为每管总弹/雷预算（航空为0，库存由舰船定义）；dispersion_*_base_u为半轴基数，*_ratio为u/u；range_u/travel_u_s用于雷/飞机/防空炮，舰炮弹道范围由初速/仰角推导，自动副炮还受automation.max_range_u的较短近防限程约束 |
| [armor.csv](armor.csv) | 4预设；belt/deck/he_resistance_mm为抽象装甲mm；torpedo_reduction为0–1固定鱼雷减伤；鼓包容量在舰船表，不参与炮伤 |
| [shells.csv](shells.csv) | 仅HE/AP；鱼雷为独立武器而非第三种炮弹；倍率与未穿/过穿比例无量纲；ricochet_deg为相对装甲法线角度 |
| [rooms.csv](rooms.csv) | 容量为每队舰数；地图、出生区、中心距为u；准备预算、倒计时、战斗上限、初装填为s；与舰型目录数量独立 |
| [rules.csv](rules.csv) | 逐行显式unit；独立规则版本、重力、穿透、感知、火灾/维修、占点、出生与后续雷/航空假设 |
| [profiles.csv](profiles.csv) | 每舰必须一条定位；id直接引用ship ID；role/strength/weakness/tactics为定位、优势、代价和推荐打法；preferred_min/max_u为建议交战距离（飞机为攻击目标距离），必须在主武器范围内；优劣文字与实际指标一同输出，不作为额外战斗加成 |

扩展编辑表：

- [controls.csv](controls.csv)：32条物理位置的显式控制政策；slot=main/secondary/light_aa，control=manual/automatic，available_modes是surface/air或以竖线连接的能力子集，mode_switch_s为共享模式切换等待；不再从secondary或武器ID后缀推断控制。没有第二武器的舰无secondary条目；航母main.manual表示玩家指挥航空攻击。自动小口径组不代表历史全部AA。
- [weapon_modes.csv](weapon_modes.csv)：17条模式覆盖16种武器；weapon_id引用武器，mode=surface/air、target_kind=ship/aircraft、shell_policy=AP_HE/HE/TORPEDO/AIR_ATTACK；range/burst_radius为u、max_elevation为度、damage_multiplier无量纲。普通模式range/max_elevation=0继承原模型；弗莱彻127速射主炮新增1600u、75°、30u球爆、伤害×0.75的HE对空模式；炮管、弹药、装填共用，不包含控制字段。BB大口径两用/重防空未设计，不自动赋予所有127/152级炮对空能力。

- [automation.csv](automation.csv)：每舰两层防空和CA/BB/CV自动副炮组；role=surface/aa，炮座/管数、舷向/射界/转速为度与度每秒，min/max_range为u，lock为s，aim_tolerance为度；hit_probability只用于AA（副炮按散布计算）。v1.2.3将防空max_range缩为1200/600u，全部AA命中概率乘0.8，AA数量和其他武器参数不变。v1.2.1的127/152级副炮最大射距为600/550u，武器散布半轴较v1.2.0扩大50%。v1.2.2只减少三艘BB的全舰副炮至4/8/4管，单侧2/4/2，其他舰不变。仅controls中明确为automatic的secondary炮组需与ships.secondary全舰管数一致；手动副炮不要求另有自动组，鱼雷不计入自动炮组。此表role是自动攻击类别，不是炮位或全部防空能力。
- [models.csv](models.csv)：外部真实模型候选审计（不控制当前8舰原创视觉绑定，原创源见[original-visuals.json](../../content/data/ships/original-visuals.json)）；12舰逐一绑定真实舰名、精确公开模型URL、作者、原格式、公开许可、可用性、上游权利状态、已有本地路径、年代/炮口适配说明与核实日期；source记录自建审查来源或 `research/models/` 审计记录路径，不表示模型是自研；数值表仍严格要求self-designed来源。`download_requires_login` 表示官方匿名下载401、未取得文件，不能填本地资产；候选许可不等于已下载或已清权。字段名/模型身份随ships校验。

空secondary_weapon_id表示没有第二攻击武器，此时炮座/管数必须为0；main必须有有效引用。phase是能力最低启用阶段，不是已实现状态。舰炮range_u=0表示按弹道算，并非射程为0；非舰炮muzzle/max_elevation/penetration与散布字段为0表示不采用此炮击模型。

编辑后执行[流水线](../../tools/balance/run.py)校验与生成；跨表ID、阶段、正值/有限数、概率、几何容量和射程均校验。细节公式和玩法约束见[设计说明](../../docs/game-design/balance-target.md)。
