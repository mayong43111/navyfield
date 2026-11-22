# 自动化测试

从项目根运行 `npm test`。Node.js 22.18+ 递归匹配 tests 下的 `.test.mjs`，不会因为分类移动而漏跑。

- simulation：弹仓、导航、弹道、散布、伤害、出生与沉没。
- content：官网解析与四舰 GLB、炮口、尺寸和外形语义。
- ui：泊位、舰型匹配、准备状态、海图和镜头。
- integration：Git 白名单、精简匹配清单和署名打包。
- [performance](performance/README.md)：未来基准。
- [fixtures](fixtures/README.md)：合法的小型测试输入约定。

当前 11 个测试文件、57 项测试。游戏内容测试读取 content，不依赖 research；无需原始下载即可执行。原始文件完整性由本地模型索引另行检查，不作为公开 CI 输入。
