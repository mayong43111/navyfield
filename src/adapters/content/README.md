# 内容读取适配器

resource-loader 负责浏览器 HTTP 传输与 JSON 解码，不依赖 Three.js、DOM 或模拟状态。

大文件按 256KiB HTTP Range 分段下载，每文件最多两个并行分段；核对 Content-Range、字节数和 ETag 后组装原始 ArrayBuffer。不支持分段的 HTTP 200 响应和内联 data URL 仍正常读取。每个请求30秒超时，失败中止同资源的其他请求并保留具体错误原因。

subscribeContentProgress 提供文件级收到/总字节数，加载界面订阅后应在完成或失败时取消订阅。GLB 解码仍由 Three.js 表现边界负责，JSON 的字段校验仍由现有解析器负责；当前没有冒充已完成规范化内容定义。
