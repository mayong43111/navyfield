# 目标数值试算报告（自动生成）

- 规则：`target-v1.3.0`；种子：`43111`。
- 输入 SHA-256：`3e3b647a3bf36afed0822f7a51c89e5ebadbec1405fda5f040d8e430357341b8`。
- 全部数值为自研目标，不是史实或原版公式；目标数值现已接入单机1对1，离线任务/修理/占点报告不代表运行功能已实现。
- 运行环境与完整精度见 [summary.json](summary.json)；编辑入口见 [设计说明](../../../docs/game-design/balance-target.md)。

## 舰船规模与火力

首版 8 艘：2 DD、2 CL、1 CA、3 BB；二期增加2艘雷击舰；三期增加2艘CV，总计12艘。全部已指定真实舰名与精确模型来源；4种本地外形、8个未下载候选，许可与炮口适配见模型清单。现有可战斗外形仍只有3种BB。只保留AP/HE炮弹，鱼雷为独立武器。炮位、目标能力、控制方式分别配置；当前近防副炮与20/40级防空采用自动控制，弗莱彻现有4管主炮新增手动两用模式。副炮不是自动炮的同义词，防空炮也不全是自动炮。

| 舰型 | 期 | HP | 初速/满速 u/s | 主武器配置 | 第二武器配置 | 主武器射程 u |
|---|---:|---:|---:|---|---|---:|
| 岛风（Shimakaze） | 1 | 12000 | 12.0/24.0 | 127级舰炮 3×1 | 无 | 1564.3 |
| 弗莱彻（USS Fletcher DD-445） | 1 | 14500 | 11.0/22.0 | 127级近程速射炮 4×1 | 无 | 1410.7 |
| 克利夫兰（USS Cleveland CL-55） | 1 | 22000 | 10.5/21.0 | 152级舰炮 3×3 | 无 | 1922.6 |
| 布鲁克林（USS Brooklyn CL-40） | 1 | 26000 | 9.5/19.0 | 152级远程精度炮 4×2 | 无 | 2435.3 |
| 希佩尔海军上将（Admiral Hipper） | 1 | 36000 | 9.0/18.0 | 203级舰炮 4×2 | gun_127_auto 4×1 | 2349.2 |
| 加利福尼亚（USS California BB-44） | 1 | 62000 | 6.0/12.0 | 356级密集齐射炮 4×3 | gun_127_auto 4×1 | 2714.8 |
| 俾斯麦（Bismarck） | 1 | 68000 | 7.5/15.0 | 380级快速装填炮 4×2 | gun_152_auto 4×2 | 2973.2 |
| 大和（Yamato） | 1 | 76000 | 6.5/13.0 | 460级远程重弹炮 3×3 | gun_152_auto 2×2 | 3243.4 |
| 阳炎（Kagero） | 2 | 12500 | 11.5/23.0 | 127级舰炮 3×1 | torpedo_fast 2×4 | 1564.3 |
| 最上（Mogami） | 2 | 33000 | 9.5/19.0 | 203级舰炮 3×2 | torpedo_long 2×4 | 2349.2 |
| 约克镇（USS Yorktown CV-5） | 3 | 50000 | 8.5/17.0 | 远程重型轰炸编队 2×3 | gun_127_auto 4×1 | 6000.0 |
| 独立（USS Independence CVL-22） | 3 | 36000 | 9.5/19.0 | 快速轻型攻击编队 1×3 | gun_127_auto 2×1 | 5000.0 |

### 炮位、能力与控制：全部12舰

这里列的是目标配装已建模能力，不是史实全部炮组；航母主武器manual表示玩家指挥航空攻击，不是手动防空舰炮。BB大口径两用/重防空炮组尚未设计，本次不虚构补装。

| 舰名 | 主武器控制/目标模式 | 第二武器控制/目标模式 | 小口径防空控制 |
|---|---|---|---|
| 岛风（Shimakaze） | manual/surface | none/none | automatic |
| 弗莱彻（USS Fletcher DD-445） | manual/surface+air | none/none | automatic |
| 克利夫兰（USS Cleveland CL-55） | manual/surface | none/none | automatic |
| 布鲁克林（USS Brooklyn CL-40） | manual/surface | none/none | automatic |
| 希佩尔海军上将（Admiral Hipper） | manual/surface | automatic/surface | automatic |
| 加利福尼亚（USS California BB-44） | manual/surface | automatic/surface | automatic |
| 俾斯麦（Bismarck） | manual/surface | automatic/surface | automatic |
| 大和（Yamato） | manual/surface | automatic/surface | automatic |
| 阳炎（Kagero） | manual/surface | manual/surface | automatic |
| 最上（Mogami） | manual/surface | manual/surface | automatic |
| 约克镇（USS Yorktown CV-5） | manual/surface | automatic/surface | automatic |
| 独立（USS Independence CVL-22） | manual/surface | automatic/surface | automatic |

## 每舰差异化：优势必须伴随代价

| 舰型/定位 | 优势 | 代价 | 推荐打法/距离u |
|---|---|---|---|
| 岛风（Shimakaze）/高速抢点侦察 | 一期最快24u/s且转向最灵活 | 12000HP低且只有3管主炮 | 绕侧抢点避开战列舰正面换血；400–1200 |
| 弗莱彻（USS Fletcher DD-445）/手动两用速射护航 | 3.5秒装填4管主炮可切换手动防空且比斥候耐打 | 单弹450HP且对舰射程短于斥候并须牺牲主炮对舰窗口进行防空 | 拦截驱逐舰或预瞄来袭飞机切换目标模式保护队友；400–1100 |
| 克利夫兰（USS Cleveland CL-55）/机动压制巡洋舰 | 21u/s与9管7秒齐射形成持续压制 | 轻装甲且精度和射程不及支援CL | 伴随DD机动集中攻击轻中型目标；700–1600 |
| 布鲁克林（USS Brooklyn CL-40）/远程精确支援 | 巡洋舰中主炮射程最长且散布最小 | 19u/s与10秒装填降低近距压制能力 | 保持距离点射目标不要追击高速DD；1600–2300 |
| 希佩尔海军上将（Admiral Hipper）/中距穿甲猎手 | 203级穿深240mm与4座双联装克制巡洋舰 | 射程略短于支援CL且不能可靠穿透BB | 中距AP猎杀巡洋舰用副炮拒止轻舰；1000–2100 |
| 加利福尼亚（USS California BB-44）/密集齐射战列舰 | 12管主炮是一期单轮弹数最多 | 12u/s最慢且穿深射程低于其他BB | 依托队友建立正横战列线打密集齐射；1200–2200 |
| 俾斯麦（Bismarck）/快速装填机动战列舰 | BB中最快15u/s且12秒装填最快并有8管副炮当前配置为自动控制 | 只有8管主炮且单发伤害低于大和 | 中近距转移侧翼持续施压避免远距对轰；1000–2300 |
| 大和（Yamato）/远程重弹堡垒 | 主炮射程穿深单弹与单轮能量及HP均最高 | 24秒装填最慢且转向最笨重散布最宽 | 2000u以上选择高价值大舰预瞄齐射后重定位；2000–3000 |
| 阳炎（Kagero）/高速近程雷击 | 23u/s与8枚近程快雷具备突袭爆发 | 主炮弱且必须进入危险近距施雷 | 利用侧翼接近发射后脱离不要持续换血；400–1200 |
| 最上（Mogami）/远程区域拒止 | 8枚2400u远雷可封锁航道并有中装甲 | 慢雷易规避且仅6管主炮弱于重巡 | 预判航道布雷配合主炮而非追求单次命中；1200–2200 |
| 约克镇（USS Yorktown CV-5）/远程重型航空打击 | 6000u任务半径6机齐袭且有36机库存 | 75秒准备慢且舰体17u/s无手动主炮 | 远离主战线组织大波次打击并保护库存；3500–5500 |
| 独立（USS Independence CVL-22）/快周转机动航空 | 50秒准备80u/s飞机与19u/s舰速 | 3机小编队单机伤害低且5000u任务半径更短 | 中距高频袭扰和换位避免与重航母比单轮爆发；2500–4500 |

### 火力指标对照

单轮能量=主武器数量×单发基础伤害（HE炮弹或航空炸弹），不计命中/装甲/副炮；理论循环率=单轮能量/装填或准备时间。飞机该率没有往返时间，不可直接与舰炮实战DPS比较。

| 舰型 | 类别 | 射程u | 装填/准备s | 单发能量 | 单轮数量 | 单轮能量 | 理论循环率 |
|---|---|---:|---:|---:|---:|---:|---:|
| 岛风（Shimakaze） | gun | 1564.3 | 5.0 | 650 | 3 | 1950 | 390.0 |
| 弗莱彻（USS Fletcher DD-445） | gun | 1410.7 | 3.5 | 450 | 4 | 1800 | 514.3 |
| 克利夫兰（USS Cleveland CL-55） | gun | 1922.6 | 7.0 | 1100 | 9 | 9900 | 1414.3 |
| 布鲁克林（USS Brooklyn CL-40） | gun | 2435.3 | 10.0 | 1250 | 8 | 10000 | 1000.0 |
| 希佩尔海军上将（Admiral Hipper） | gun | 2349.2 | 10.0 | 2100 | 8 | 16800 | 1680.0 |
| 加利福尼亚（USS California BB-44） | gun | 2714.8 | 16.0 | 4000 | 12 | 48000 | 3000.0 |
| 俾斯麦（Bismarck） | gun | 2973.2 | 12.0 | 4700 | 8 | 37600 | 3133.3 |
| 大和（Yamato） | gun | 3243.4 | 24.0 | 6500 | 9 | 58500 | 2437.5 |
| 阳炎（Kagero） | gun | 1564.3 | 5.0 | 650 | 3 | 1950 | 390.0 |
| 最上（Mogami） | gun | 2349.2 | 10.0 | 2100 | 6 | 12600 | 1260.0 |
| 约克镇（USS Yorktown CV-5） | aircraft | 6000.0 | 75.0 | 4500 | 6 | 27000 | 360.0 |
| 独立（USS Independence CVL-22） | aircraft | 5000.0 | 50.0 | 3200 | 3 | 9600 | 192.0 |

### 统一靶标比较

同为1000u、HE、正横、希佩尔海军上将（Admiral Hipper）靶标，每舰10000次齐射。隔离目标大小/装甲差异；只比较主炮，后续鱼雷/航空不混入。

| 舰型 | 命中率（95%区间） | 期望主炮HE DPS |
|---|---|---:|
| 岛风（Shimakaze） | 21.77% (21.30%–22.24%) | 38.5 |
| 弗莱彻（USS Fletcher DD-445） | 21.98% (21.57%–22.39%) | 51.5 |
| 克利夫兰（USS Cleveland CL-55） | 19.15% (18.90%–19.41%) | 123.1 |
| 布鲁克林（USS Brooklyn CL-40） | 28.04% (27.73%–28.35%) | 127.4 |
| 希佩尔海军上将（Admiral Hipper） | 17.37% (17.11%–17.63%) | 132.7 |
| 加利福尼亚（USS California BB-44） | 14.88% (14.68%–15.08%) | 202.9 |
| 俾斯麦（Bismarck） | 14.94% (14.70%–15.19%) | 212.8 |
| 大和（Yamato） | 13.96% (13.74%–14.19%) | 154.7 |
| 阳炎（Kagero） | 21.88% (21.41%–22.35%) | 38.7 |
| 最上（Mogami） | 16.96% (16.66%–17.26%) | 97.2 |

该比较不代表AP穿深收益或舰队胜率。支援CL精度优势可能抵消慢装填；大和单轮与射程领先不等于持续DPS领先；差异化验收采用同类舰优势/代价顺序测试而非人为综合评分。


## 主炮蒙特卡洛：静态预瞄、每管独立散布

不含副炮/火灾/修理/导航/射界；命中是椭圆落点与旋转舰体矩形相交。期望DPS不是实际扣血曲线，能量TTK=HP/期望DPS，不含初装填与飞行。95%区间仅覆盖独立采样误差，不覆盖模型误差。

| 场景 | 弹种 | 距离 | 命中率（95%区间） | 每命中伤害/结果 | 期望DPS | 能量TTK s |
|---|---|---:|---|---|---:|---:|
| dd_close | HE | 600 | 16.66% (16.25%–17.09%) | 500/belt/blast | 50.0 | 240.0 |
| cl_mid | HE | 1000 | 14.99% (14.76%–15.23%) | 846/belt/blast | 163.1 | 134.9 |
| ca_ap | AP | 1200 | 15.14% (14.89%–15.39%) | 2205/belt/penetration | 267.1 | 134.8 |
| california_ap | AP | 1600 | 14.59% (14.39%–14.79%) | 4200/belt/penetration | 459.6 | 134.9 |
| bismarck_ap | AP | 1600 | 16.31% (16.06%–16.57%) | 4935/belt/penetration | 536.6 | 126.7 |
| yamato_ap | AP | 1600 | 16.20% (15.97%–16.45%) | 6825/belt/penetration | 414.7 | 183.3 |
| yamato_he | HE | 1600 | 16.10% (15.86%–16.34%) | 1625/belt/blast | 98.1 | 774.9 |
| yamato_bow | AP | 1600 | 35.71% (35.40%–36.03%) | 683/belt/blocked | 91.5 | 830.8 |
| yamato_long | AP | 2800 | 10.10% (9.90%–10.29%) | 6825/deck/penetration | 258.4 | 294.1 |
| bb_vs_dd_he | HE | 1000 | 7.41% (7.24%–7.58%) | 5000/belt/blast | 139.0 | 86.4 |
| bb_vs_dd_ap | AP | 1000 | 7.33% (7.16%–7.50%) | 1706/belt/overpenetration | 46.9 | 255.9 |
| dd_vs_bb_ap | AP | 1000 | 35.32% (34.78%–35.87%) | 68/belt/blocked | 14.4 | 5273.4 |

## 离散主炮对射

双方固定距离、同弹种与几何参数，7秒首次开火；逐齐射扣弹、飞行后同时结算。先到的致死弹阻止后续开火，已在途弹仍在未结束时结算。只统计首个击沉/同时击沉，未结算后续追击。900秒或耗尽弹药仍存活计超时；不将超时样本当成900秒击沉。

| 场景 | 次数 | 攻方胜/守方胜/同沉/超时 | 已决中位 s | 已决P90 s |
|---|---:|---|---:|---:|
| dd_close | 300 | 147/140/13/0 | 215.6 | 265.6 |
| cl_mid | 300 | 173/103/24/0 | 131.6 | 159.6 |
| ca_ap | 300 | 152/126/22/0 | 133.2 | 163.2 |
| california_ap | 300 | 135/123/42/0 | 126.8 | 158.8 |
| bismarck_ap | 300 | 143/124/33/0 | 122.4 | 146.4 |
| yamato_ap | 300 | 123/142/35/0 | 158.0 | 230.0 |
| yamato_he | 300 | 140/131/21/8 | 710.0 | 806.0 |
| yamato_bow | 300 | 122/134/25/19 | 806.0 | 854.0 |
| yamato_long | 300 | 133/137/30/0 | 284.4 | 356.4 |
| bb_vs_dd_he | 300 | 300/0/0/0 | 107.3 | 203.3 |
| bb_vs_dd_ap | 300 | 300/0/0/0 | 275.3 | 419.3 |
| dd_vs_bb_ap | 300 | 0/300/0/0 | 275.3 | 419.3 |

## 房间接敌时序

两舰正对同一直线、满动力加速、无障碍/转向；首次可射=max(初装填,驶入可见射程时间)，不保证首发命中。最近合法点含两侧各200u边界余量；不同初速与加速度均参与。入房到可射预算包含完整准备时长，全部READY可提前开始。

| 房间 | 对阵 | 位置 | 间距u | 开战至首射s | 首轮抵达s | 双方入射程s | 入房至首射预算s |
|---|---|---|---:|---:|---:|---:|---:|
| duel | scout_dd/scout_dd | center | 4400 | 62.8 | 73.5 | 62.8 | 95.8 |
| duel | scout_dd/scout_dd | nearest_legal | 3600 | 46.2 | 56.8 | 46.2 | 79.2 |
| duel | scout_dd/yamato | center | 4400 | 35.6 | 52.4 | 81.0 | 68.6 |
| duel | scout_dd/yamato | nearest_legal | 3600 | 13.7 | 30.5 | 59.4 | 46.7 |
| duel | california/california | center | 4400 | 75.2 | 90.6 | 75.2 | 108.2 |
| duel | california/california | nearest_legal | 3600 | 41.9 | 57.3 | 41.9 | 74.9 |
| duel | bismarck/bismarck | center | 4400 | 52.9 | 69.0 | 52.9 | 85.9 |
| duel | bismarck/bismarck | nearest_legal | 3600 | 26.2 | 42.4 | 26.2 | 59.2 |
| duel | yamato/yamato | center | 4400 | 49.9 | 66.7 | 49.9 | 82.9 |
| duel | yamato/yamato | nearest_legal | 3600 | 19.1 | 35.9 | 19.1 | 52.1 |
| duel | scout_dd/yamato | fastest_of_all_36_pairs | 3600 | 13.7 | 30.5 | 59.4 | 46.7 |
| skirmish | scout_dd/scout_dd | center | 5400 | 83.7 | 94.3 | 83.7 | 131.7 |
| skirmish | scout_dd/scout_dd | nearest_legal | 4600 | 67.0 | 77.6 | 67.0 | 115.0 |
| skirmish | scout_dd/yamato | center | 5400 | 62.6 | 79.5 | 108.0 | 110.6 |
| skirmish | scout_dd/yamato | nearest_legal | 4600 | 41.0 | 57.8 | 86.4 | 89.0 |
| skirmish | california/california | center | 5400 | 116.9 | 132.3 | 116.9 | 164.9 |
| skirmish | california/california | nearest_legal | 4600 | 83.5 | 99.0 | 83.5 | 131.5 |
| skirmish | bismarck/bismarck | center | 5400 | 86.2 | 102.4 | 86.2 | 134.2 |
| skirmish | bismarck/bismarck | nearest_legal | 4600 | 59.6 | 75.7 | 59.6 | 107.6 |
| skirmish | yamato/yamato | center | 5400 | 88.4 | 105.2 | 88.4 | 136.4 |
| skirmish | yamato/yamato | nearest_legal | 4600 | 57.6 | 74.4 | 57.6 | 105.6 |
| skirmish | scout_dd/yamato | fastest_of_all_36_pairs | 4600 | 41.0 | 57.8 | 86.4 | 89.0 |
| fleet | scout_dd/scout_dd | center | 6400 | 104.5 | 115.1 | 104.5 | 169.5 |
| fleet | scout_dd/scout_dd | nearest_legal | 5200 | 79.5 | 90.1 | 79.5 | 144.5 |
| fleet | scout_dd/yamato | center | 6400 | 89.6 | 106.5 | 135.0 | 154.6 |
| fleet | scout_dd/yamato | nearest_legal | 5200 | 57.2 | 74.1 | 102.6 | 122.2 |
| fleet | california/california | center | 6400 | 158.5 | 174.0 | 158.5 | 223.5 |
| fleet | california/california | nearest_legal | 5200 | 108.5 | 124.0 | 108.5 | 173.5 |
| fleet | bismarck/bismarck | center | 6400 | 119.6 | 135.7 | 119.6 | 184.6 |
| fleet | bismarck/bismarck | nearest_legal | 5200 | 79.6 | 95.7 | 79.6 | 144.6 |
| fleet | yamato/yamato | center | 6400 | 126.8 | 143.7 | 126.8 | 191.8 |
| fleet | yamato/yamato | nearest_legal | 5200 | 80.7 | 97.5 | 80.7 | 145.7 |
| fleet | scout_dd/yamato | fastest_of_all_36_pairs | 5200 | 57.2 | 74.1 | 102.6 | 122.2 |
| legacy_10R_lower_bound | scout_dd/scout_dd | edge_no_margin | 32434 | 1102.5 | — | 1102.5 | — |
| legacy_10R_lower_bound | california/california | edge_no_margin | 32434 | 1061.4 | — | 1061.4 | — |
| legacy_10R_lower_bound | bismarck/bismarck | edge_no_margin | 32434 | 1052.2 | — | 1052.2 | — |
| legacy_10R_lower_bound | yamato/yamato | edge_no_margin | 32434 | 1042.5 | — | 1042.5 | — |

**10R对照只是布局政策试验**：R取本目标版本最长主炮射程，速度取当前原型统一上限14u/s，忽略加速、舰体边距及初始整备，故为接敌时间下界；不冒充当前配装的实际时间。当前原型自身R取决于出战配装与炮口高度，需运行时另测。

## 其他机制的解析试算（非集成战斗）

航空解析值仅作固定12秒近程总HP损耗预算，不是逐机击落结果；分层防空和存活机数以后一节试算为准。

| 项目 | 值1 | 值2 | 值3 | 含义 |
|---|---:|---:|---:|---|
| utility:scout_dd | 90.00 | 960.00 | 19.63 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:escort_dd | 108.75 | 1160.00 | 24.28 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:fast_cl | 165.00 | 1760.00 | 35.90 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:support_cl | 195.00 | 2080.00 | 42.99 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:heavy_ca | 270.00 | 2880.00 | 55.85 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:california | 465.00 | 4960.00 | 117.81 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:bismarck | 510.00 | 5440.00 | 104.72 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:yamato | 570.00 | 6080.00 | 135.33 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:torpedo_dd | 93.75 | 1000.00 | 21.85 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:torpedo_ca | 247.50 | 2640.00 | 49.60 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:yorktown | 375.00 | 4000.00 | 85.01 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| utility:light_cv | 270.00 | 2880.00 | 62.83 | one_fire_hp;one_repair_hp;full_speed_180_turn_s |
| capture:duel | 76.67 | 166.67 | 600.00 | center_spawn_scout_arrival_s;uncontested_capture_finish_s;combat_limit_s |
| capture:skirmish | 97.50 | 187.50 | 900.00 | center_spawn_scout_arrival_s;uncontested_capture_finish_s;combat_limit_s |
| capture:fleet | 118.33 | 208.33 | 1200.00 | center_spawn_scout_arrival_s;uncontested_capture_finish_s;combat_limit_s |
| torpedo_fast | 36.84 | 14400.00 | 22400.00 | max_range_travel_s;two_hits_hull_damage;8_torpedo_expected_prebulge_damage |
| torpedo_long | 80.00 | 11600.00 | 19600.00 | max_range_travel_s;two_hits_hull_damage;8_torpedo_expected_prebulge_damage |
| yorktown | 0.68 | 10098.00 | 198.08 | expected_survival_fraction;expected_raid_damage;4000u_prepare_roundtrip_cycle_s |
| light_cv | 0.36 | 1900.80 | 150.00 | expected_survival_fraction;expected_raid_damage;4000u_prepare_roundtrip_cycle_s |

## 自动副炮：近身绕行对照

BB固定且关闭主炮，DD以满速沿圆周绕行并用HE攻击；自动副炮有分舷射界、有限转速、1秒锁定、常速提前量、曲线运动误差、散布、弹药与在途弹。开关对照不表示真人胜率，未击沉不等于安全；180秒截断。DD命中BB使用正横靶标近似，未模拟炮座遮挡/手动瞄准难度。

| 场景 | 自动副炮 | DD击沉/BB击沉/未决 | DD击沉中位s | 平均DD损失HP | 平均BB损失HP |
|---|---|---|---:|---:|---:|
| cal_close:off | False | 0/0/300 | 未决 | 0.0 | 10621.6 |
| cal_close:auto | True | 168/0/132 | 166.8 | 11423.4 | 9921.3 |
| cal_mid:off | False | 0/0/300 | 未决 | 0.0 | 6606.4 |
| cal_mid:auto | True | 0/0/300 | 未决 | 0.0 | 6606.4 |
| cal_outside:off | False | 0/0/300 | 未决 | 0.0 | 4609.6 |
| cal_outside:auto | True | 0/0/300 | 未决 | 0.0 | 4609.6 |
| bis_close:off | False | 0/0/300 | 未决 | 0.0 | 11819.1 |
| bis_close:auto | True | 300/0/0 | 88.6 | 12000.0 | 5758.8 |
| bis_mid:off | False | 0/0/300 | 未决 | 0.0 | 7400.7 |
| bis_mid:auto | True | 0/0/300 | 未决 | 0.0 | 7400.7 |
| bis_outside:off | False | 0/0/300 | 未决 | 0.0 | 5219.8 |
| bis_outside:auto | True | 0/0/300 | 未决 | 0.0 | 5219.8 |
| yam_close:off | False | 0/0/300 | 未决 | 0.0 | 12413.5 |
| yam_close:auto | True | 122/0/178 | 154.4 | 10730.8 | 11640.4 |
| yam_mid:off | False | 0/0/300 | 未决 | 0.0 | 7764.2 |
| yam_mid:auto | True | 0/0/300 | 未决 | 0.0 | 7764.2 |
| yam_outside:off | False | 0/0/300 | 未决 | 0.0 | 5471.9 |
| yam_outside:auto | True | 0/0/300 | 未决 | 0.0 | 5471.9 |

## 自动防空炮：分层射程与逐机击落

同一波飞机直线从中程防空边界接近至350u投弹；中近程炮组独立索敌、装填与弹仓，延迟到达、集中射击及过量伤害均计入。固定单弹命中概率是自研标定值而非航空物理；没有机动、返航和多舰叠加。同波只计投弹前生存飞机，投弹后到达的炮弹不阻止本次投弹。

| 防御舰/来袭舰 | 飞机数 | 进场s | 平均击落 | 平均存活 | 期望投弹伤害/无AA基线 |
|---|---:|---:|---:|---:|---:|
| 弗莱彻（USS Fletcher DD-445）/约克镇（USS Yorktown CV-5） | 6 | 13.1 | 0.01 | 5.99 | 14817.0/14850.0 |
| 弗莱彻（USS Fletcher DD-445）/独立（USS Independence CVL-22） | 3 | 10.6 | 0.00 | 3.00 | 5280.0/5280.0 |
| 加利福尼亚（USS California BB-44）/约克镇（USS Yorktown CV-5） | 6 | 13.1 | 0.97 | 5.03 | 12457.5/14850.0 |
| 加利福尼亚（USS California BB-44）/独立（USS Independence CVL-22） | 3 | 10.6 | 0.57 | 2.43 | 4270.9/5280.0 |
| 俾斯麦（Bismarck）/约克镇（USS Yorktown CV-5） | 6 | 13.1 | 0.84 | 5.16 | 12771.0/14850.0 |
| 俾斯麦（Bismarck）/独立（USS Independence CVL-22） | 3 | 10.6 | 0.39 | 2.61 | 4593.6/5280.0 |
| 大和（Yamato）/约克镇（USS Yorktown CV-5） | 6 | 13.1 | 0.96 | 5.04 | 12465.8/14850.0 |
| 大和（Yamato）/独立（USS Independence CVL-22） | 3 | 10.6 | 0.60 | 2.40 | 4218.1/5280.0 |

详见 [自动火炮规则](../../../docs/game-design/automatic-weapons.md)；对应真实舰名与模型核实见 [模型清单](../../../docs/game-design/ship-models.md)。舰名是外形绑定，不表示目标炮座数量还原史实。


## 弗莱彻手动两用主炮防空：独立编队对照

4管主炮共用140发/管、3.5秒装填与2.5秒模式切换等待，7秒初始整备；手动防空期间不叠加同组对舰火力。HE定时爆炸半径30u、对飞机伤害337.5HP/命中、对空水平射程1600u、最大仰角75°。自动小口径炮是另一组，可与主炮并行。

飞机高度120u，横向间隔80u，同一投弹线x=350u；主炮采用低弧截击、原有散布、每轮共同预瞄误差、每弹引信误差和球形爆炸。ideal/practiced/rough为人为误差输入，不是真人水平测量或胜率；爆炸仅在投弹前结算，过量与在途伤害不算额外击落。自动对照也使用相同展开编队与1600u起点，因此不得拿本表直接减去上节1200u、同坐标简化基线。

| 来袭舰 | 误差档 | 防御组合 | 飞机数 | 平均击落 | 平均存活 | 期望投弹伤害/无AA |
|---|---|---|---:|---:|---:|---:|
| 约克镇（USS Yorktown CV-5） | ideal | automatic_only | 6 | 0.02 | 5.98 | 14792.2/14850.0 |
| 约克镇（USS Yorktown CV-5） | ideal | manual_only | 6 | 1.08 | 4.92 | 12168.8/14850.0 |
| 约克镇（USS Yorktown CV-5） | ideal | combined | 6 | 1.50 | 4.50 | 11137.5/14850.0 |
| 约克镇（USS Yorktown CV-5） | practiced | automatic_only | 6 | 0.02 | 5.98 | 14792.2/14850.0 |
| 约克镇（USS Yorktown CV-5） | practiced | manual_only | 6 | 0.97 | 5.03 | 12449.2/14850.0 |
| 约克镇（USS Yorktown CV-5） | practiced | combined | 6 | 1.20 | 4.80 | 11888.3/14850.0 |
| 约克镇（USS Yorktown CV-5） | rough | automatic_only | 6 | 0.02 | 5.98 | 14792.2/14850.0 |
| 约克镇（USS Yorktown CV-5） | rough | manual_only | 6 | 0.09 | 5.91 | 14627.2/14850.0 |
| 约克镇（USS Yorktown CV-5） | rough | combined | 6 | 0.48 | 5.52 | 13662.0/14850.0 |
| 独立（USS Independence CVL-22） | ideal | automatic_only | 3 | 0.00 | 3.00 | 5280.0/5280.0 |
| 独立（USS Independence CVL-22） | ideal | manual_only | 3 | 0.98 | 2.02 | 3549.3/5280.0 |
| 独立（USS Independence CVL-22） | ideal | combined | 3 | 1.00 | 2.00 | 3520.0/5280.0 |
| 独立（USS Independence CVL-22） | practiced | automatic_only | 3 | 0.00 | 3.00 | 5280.0/5280.0 |
| 独立（USS Independence CVL-22） | practiced | manual_only | 3 | 0.79 | 2.21 | 3889.6/5280.0 |
| 独立（USS Independence CVL-22） | practiced | combined | 3 | 0.97 | 2.03 | 3572.8/5280.0 |
| 独立（USS Independence CVL-22） | rough | automatic_only | 3 | 0.00 | 3.00 | 5280.0/5280.0 |
| 独立（USS Independence CVL-22） | rough | manual_only | 3 | 0.03 | 2.97 | 5227.2/5280.0 |
| 独立（USS Independence CVL-22） | rough | combined | 3 | 0.24 | 2.76 | 4863.5/5280.0 |

误差定义、共享状态和BB边界详见 [炮组分类与手动防空](../../../docs/game-design/weapon-controls.md)。未模拟真人输入、炮座遮挡与转速、引信研发或BB重防空；不能据此声称已经解决全舰队防空平衡。


## 结论与验收边界

- 大口径AP适合正横装甲目标；对驱逐舰会过穿，HE更稳定；迎角增加与远射会改变穿透结果，不能只按口径排名。
- 首版标准任务推荐4v4至8v8；以上对射不是全舰队模拟，不能据此保证阵容胜率。BB每队最多3艘的目标规则尚未接入。
- 10R远距离政策会使满速接敌下界达到十几分钟；目标房间将部署尺度与武器尺度分开配置，没有更改现有10R要求。
- 两次维修最多恢复16%最大HP，单火15秒损失0.75%HP；火灾概率与上限没有加入主炮试算。
- 鱼雷防护只抵消鱼雷，先做装甲减伤、再消耗防雷容量；航空包括解析周转预算与分层逐机防空试算，仍不是完整飞机AI。
- 本版只验证圆周DD的简化提前量偏差与分舷射界，没有验证任意机动、模型遮挡、船员、装甲重量、避碰、联网延迟、经济成长或渲染性能。后续接入需固定30Hz内核回归与真人试玩。
