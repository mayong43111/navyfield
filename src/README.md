# 游戏程序

本轮保留现有 TypeScript 业务结构，仅更新运行资源路径；[架构规划](../docs/technical/architecture.md)描述将来的分层。

- main：场景流程、输入、战斗协调和表现。
- combat / navigation / ammunition：现有战斗、导航与弹仓计算。
- original-data：读取 content 中的官网兼容数据。
- ships / yamato / shipyard：模型实例、炮座与船坞。
- lobby / lobby-state / lobby-art / ui：战区、准备状态、海图和仪表。
- camera：战斗镜头与边缘滚屏。

不能将这份分类当作已独立的纯模拟内核。后续拆分保持现有玩法和测试，固定步长、全舰队会话、存档及联机另行实现；禁止从研究或原型目录建立运行依赖。
