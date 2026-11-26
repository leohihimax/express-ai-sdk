# ESA 函数和 Pages 即时日志测试

打开部署域名的 `/log-tests`，即可在浏览器中触发真实的服务端 Console 和 stderr 输出。每次测试返回独立的 `runId` 和预期结果，可在 ESA 即时日志中按正文查找并逐条比对。日志测试无需配置 OpenAI 密钥。

## 运行与部署

在项目根目录执行以下命令，然后打开 [本地日志测试页](http://localhost:8080/log-tests)。

```sh
npm install
npm run dev
```

普通 Node.js 部署可执行 `npm run build`，然后用 `npm start` 启动，默认监听 8080 端口。本地终端可核对实际输出内容与换行。

### 查看构建和运行时的 Node.js 版本

部署后打开 `/node-version`，或从首页点击「查看构建和运行时的 Node.js 版本」。`buildNode` 来自本次 `npm run build` 保存的版本，`runtimeNode` 来自处理请求的 Node.js 进程。两个完整版本号相同时，`exactMatch` 为 `true`。如果没有构建记录，例如刚检出项目就运行 `npm run dev`，`buildNode` 和 `exactMatch` 都为 `null`。

Vercel 使用默认 Express 构建设置时会执行本项目的 `build` 脚本。如果已自定义 Build Command，请确保该命令执行 `npm run build`。

在 ESA 部署此仓库时，使用 Express，安装命令填 `npm install`，函数入口填 `src/app.ts`。该文件默认导出 Express 应用。测试 Pages 时，让 `/log-tests` 和 `/log-tests/*` 都由动态函数处理。若配置了静态托管的导航回退策略，浏览器直接打开测试页时可能收到静态页面。[ESA Express 部署说明](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/express) · [Pages 构建与路由说明](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/build-pages)

若 ESA 预览地址带有查询参数，可从项目首页点击「ESA 即时日志测试」。测试页链接和后续表单请求都会携带预览参数。

## 在控制台验收

1. 在 ESA 控制台进入「边缘计算和 AI → 函数和 Pages」，选择本次部署的对象，打开「日志 → 即时日志」，点击「开始监测」。另开标签页访问部署域名的 `/log-tests`。[ESA 即时日志说明](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/instant-logs)
2. 先触发一次等级测试，保存回执中的 `runId`。在即时日志详情或导出的 JSON 中，查找带 `esa-log/<runId> ` 前缀的正文，对照下表检查级别。
3. 再触发多行测试。一次 `console.log` 调用中用实际换行符分隔三段内容，应得到三条 INFO 记录，依次输出带同一前缀的 `a`、`b`、`c`。确认它们共享一个 ESA 请求 ID。再执行一次，确认新请求获得另一个请求 ID。
4. 对每个部署对象分别运行条数与长度测试，保存回执、原始日志和发布版本。页面中的预期值描述应用发出的内容，平台采集结果以即时日志为准。

| 输出方式 | 预期 level | 单次等级测试的条数 |
| --- | --- | --- |
| `console.log` | INFO | 1 |
| `console.info` | INFO | 1 |
| `console.warn` | WARNING | 1 |
| `console.error` | ERROR | 1 |
| `console.debug` | DEBUG | 1 |
| `process.stderr.write` | ERROR | 1 |

等级测试回执中的 `writeResult` 记录每次调用的结果。`returned` 表示调用正常返回，实际采集条数和等级需在 ESA 日志中核对。若运行时缺少方法，接口会继续尝试其余方法，用 `unavailable` 列出缺项并返回 HTTP 501。若写入同步抛错，回执标记 `threw` 并返回 HTTP 500。

### 换行用例

`POST /log-tests/multiline` 接受两个可选表单参数。`method` 可选 `log`（默认）、`info`、`warn`、`error`、`debug` 或 `stderr`，各条记录应继承该方法的等级。`format` 决定一次调用传入的正文格式。

| format | 观察内容 |
| --- | --- |
| `lf`（默认） | 实际 LF 分隔三段带前缀的正文，应拆成三条。 |
| `empty` | 首部、中间和末尾各包含空行。按同一 ESA 请求 ID 查看每个位置是否保留空记录。 |
| `crlf` | 用 CRLF 分隔各段。查看导出的正文，记录 LF 切分后行尾的回车（CR）是否保留。 |
| `literal` | 输入包含反斜杠和字母 n 组成的字面量 `\n`，应保留在同一条正文中。 |

回执包含输入正文 `input` 和按实际 LF 切出的 `segments`。空行与 CRLF 用例还会给出观察提示。核对 JSON 时先解码字符串，再检查换行、回车和反斜杠。

### 逐条核对字段

| ESA 日志字段 | 验证方法 |
| --- | --- |
| `functionName`、`codeVersion`（String） | 对照目标函数名称与当前生效的发布版本。Pages 使用该部署关联的函数名称及版本。 |
| `requestId`（String） | 与 ESA 对应请求记录的 ID 比对，同一次请求的各行应一致。`runId` 由应用生成，用于从正文定位这批行。 |
| `timestamp`（DateTime） | 值应包含时区，例如 UTC 的 `Z` 或 `+08:00` 偏移。换算到同一时区，用回执的 `startedAt`、`finishedAt` 核对日志产生时间。 |
| `region`（String） | 与该请求的 ESA 执行节点区域核对。 |
| `host`、`path`（String） | 核对实际访问的域名和 URI 路径，回执给出应用收到的 Host 和路径。可给测试 URL 加 `?sample=1`，检查 `path` 仍只含路径部分。 |
| `level`（Enum）、`log`（String） | 按上表匹配输出方法与等级，逐行比对回执中的预期正文或生成规则。 |

### 条数、长度及超限行为

| 用例 | 测试输入 | 应用输出 |
| --- | --- | --- |
| `POST /log-tests/count` | `lines` 为 0–4096，`mode` 为 `calls` 或 `multiline` | 行号从 1 到 `lines`。`calls` 每行调用一次，`multiline` 把所有行拼成一个字符串调用一次。`lines=0` 时跳过输出。 |
| `POST /log-tests/length` | `bytes` 为 0–262144，`encoding` 为 `ascii` 或 `utf8` | 先输出指定 UTF-8 字节数的一行，再输出一条短日志，观察超长行之后同请求内的日志能否继续采集。 |

`bytes` 计入正文前缀和尾标记 `|END|`，不计行末换行。若正文装不下完整前缀和尾标记，就只写填充字符。`bytes=0` 产生空行，可借同请求后续短日志定位。`utf8` 用汉字填充，剩余的 1–2 字节用 ASCII 补齐。

若条数测试在写入中途抛错，`callsReturned` 给出此前正常返回的调用次数。长度测试会继续尝试输出后续短日志，`bodyWrite` 和 `afterWrite` 分别记录两次调用的结果。

1. **单请求条数**。先用 0、1、3 行建立基线。用两种模式分别逐步增加行数，记录首个出现缺行的输入、保留的序号以及平台提示。有了约定的最大值 N，再依次测试 N−1、N、N+1，检查是否保留首部、尾部或返回错误。随后发一个小请求，确认计数按请求重置。
2. **单条长度**。先用 0、1 字节检查空行和极短行。对 ASCII 和中文分别逐步增加长度。约定上限为 L 后按其计量单位测试 L−1、L、L+1，对比原始 `log` 的 UTF-8 字节数和字符数，记录尾标记是否完整、平台添加的截断标记原文、是否出现替换字符及后续短日志是否仍可见。`|END|` 是应用主动写入的正文，用于识别末尾。
3. **排除展示窗口影响**。ESA 文档列明，同一对象同时可开一个监测窗口，最长 60 分钟，每次最多保留 40 条记录，旧记录会被覆盖。及时查看详情并导出 JSON。窗口已覆盖记录时，需要用能观察完整请求的日志接口或采集端复核，再判断单请求条数是否超限。[ESA 即时日志使用限制](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/instant-logs)

4096 行和 262144 字节是本测试工具的输入上限。若测试到顶仍未出现截断或丢弃，只能说明该范围内未触发限制。正式发布前，应由日志接口评审确定单请求最大条数、单条最大长度及其单位、截断标记和超限处理，并将最终规则写入控制台文档。

### 用 curl 复测

```sh
BASE=http://localhost:8080
curl -sS -X POST "$BASE/log-tests/levels?sample=1"
curl -sS -X POST "$BASE/log-tests/multiline"
curl -sS -d 'method=warn&format=empty' "$BASE/log-tests/multiline"
curl -sS -d 'method=stderr&format=crlf' "$BASE/log-tests/multiline"
curl -sS -d 'method=debug&format=literal' "$BASE/log-tests/multiline"
curl -sS -d 'lines=8&mode=calls' "$BASE/log-tests/count"
curl -sS -d 'lines=8&mode=multiline' "$BASE/log-tests/count"
curl -sS -d 'bytes=4096&encoding=utf8' "$BASE/log-tests/length"
```

## 原有 AI SDK 示例

项目也提供使用 Express 和 AI SDK 生成流式响应的示例。要运行这些接口，可在项目根目录的 `.env` 中设置 `OPENAI_API_KEY`，按上述命令启动，再发送请求。

```sh
curl -X POST http://localhost:8080
curl -X POST http://localhost:8080/custom-data-parts
curl -i http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  --data '{"messages":[{"role":"user","id":"msg1","parts":[{"type":"text","text":"what happened yesterday in tech?"}]}]}'
```
