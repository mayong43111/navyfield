# 数值试验

保存可重复的目标规则实验输入，不覆盖运行数据。目标公式集中在[离线模型](../../tools/balance/model.py)，实验与测试共同调用；当前运行规则仍留在TypeScript内核，没有复制一份旧公式作为新真值。

- [scenarios.csv](scenarios.csv)：12个AP/HE主炮场景，引用舰型/弹种ID；range_u为u；target_heading_deg为舰体长轴与射向夹角（0迎头、90正横）；impact_obliquity_deg为舷侧装甲法线入射角，两者独立；salvos为采样齐射次数，不是实战库存。
- [settings.csv](settings.csv)：种子43111、每场景300次离散对射、900s对射上限。每场景ID哈希派生独立随机流，新增场景不影响旧场景。`trait_range_u=1000`、`trait_salvos=10000`、`trait_target_id=heavy_ca`定义逐舰统一对照：各舰主炮使用HE，在1000u攻击正横重巡靶标，比较命中率与期望持续伤害；不把理论全中输出当作实际DPS。

- [auto_scenarios.csv](auto_scenarios.csv)：9个BB/绕行DD场景，各生成开关副炮对照，另有8个来袭航空场景；defender/attacker为ship ID，orbit.distance_u为实际圆周半径，air.distance_u=0表示由防空边界与settings.aa_attack_distance_u自动确定航路。settings中auto_runs=300、auto_limit_s=180、auto_step_s=0.1；航空从当前中程AA边界1200u飞至350u投弹，缩短防空射程会缩短暴露时间，而不是缩短航空任务总距离。原始主炮场景仍不含副炮，自动火力单独试算，不混用两类结果。

- [manual_aa_scenarios.csv](manual_aa_scenarios.csv)：弗莱彻手动两用主炮，两类航母×三档误差，共6个输入、18条自动单用/手动单用/合用输出；altitude_u=120、formation_spacing_u=80，aim_error_deg为每轮角度正态标准差，lead_error_s为每轮提前量正态标准差，fuse_error_s为每弹引信均匀误差半宽。accuracy只是输入档位，不是真人测量；全部模式从1600u到x=350u投弹线，使用同一展开编队。沿用auto_runs=300与auto_step_s=0.1；有限进场时间不使用绕行实验auto_limit_s。主炮4管、装填/弹药共用，物理弹道与球爆见[手动防空规则](../../docs/game-design/weapon-controls.md)。旧automatic-air是1200u起点同坐标简化基线，不能直接与新表作增量比较。

[生成器](../../tools/balance/run.py)同时产生主炮蒙特卡洛（每场景10000齐射）、逐齐射/飞行到达的静态对射、三种一期房间的代表性与全36种舰型配对最快接敌、10R政策下界、火灾/维修/占点/转向以及后续雷/航空解析估算。另增加有限转速/射界/锁定/弹药/延迟结算的副炮绕行对照与逐机防空试算。后两期仍没有集成鱼雷/航空战斗模拟。

命中区间是95%Wilson独立样本区间。对射胜负统计包含同时击沉和超时；中位/P90只对已决样本。实验不含导航、射界、副炮、火灾或维修；不能把其结果当成真实全舰队平衡或原版算法验证。执行方式见[数值总览](../README.md)。
