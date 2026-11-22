# 打包工具

未来独立的运行清单、许可核对和打包报告工具归入这里；当前没有额外脚本。

当前 Web 构建仍由根 vite.config.mjs 和 GitHub Actions 管理：Vite 打包实际静态引用，插件仅复制必需署名。不得递归复制 research、art、audio 或全部 content，也不得在 dist 手改资产。
