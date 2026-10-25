# PageWeave CLI

CLI 连接本机正在运行的 PageWeave，可供 AI 编码工具、脚本和终端调用。打开软件和文稿后，在解压目录运行 `pageweave.cmd`，无需另装 Node.js。源码开发时使用 `npm run cli -- <命令>`。

## 读取与修改

```powershell
.\pageweave.cmd help
.\pageweave.cmd status
$document = .\pageweave.cmd read --file main.tex | ConvertFrom-Json
.\pageweave.cmd write --file main.tex --input edited.tex --revision $document.data.revision
```

`read` 返回当前源码，包含编辑器内尚未自动保存的输入。省略 `--file` 时选择当前主文件。`write` 的输入为 UTF-8 文本；`--input -` 从标准输入读取。CLI 不读取 AI 服务密钥，不调用外部模型。

也可用精确替换。将以下内容保存为 UTF-8 `patch.json`：

```json
{"find":"需要替换的原文","replace":"替换后的内容","all":false}
```

```powershell
$document = .\pageweave.cmd read | ConvertFrom-Json
.\pageweave.cmd replace --input patch.json --revision $document.data.revision
```

原文不存在或出现多次时拒绝替换；明确设置 `all: true` 才替换所有匹配。`revision` 与当前文稿内容、资源和编辑会话绑定；正文、格式或当前文件变化后，旧 revision 会被拒绝。收到 `REVISION_CONFLICT` 时重新读取并判断修改是否仍然适用，不应直接重复提交旧内容。

修改会同步到写作与源码视图，并进入保存、恢复和撤销流程。存在待审修订时，正文源码仍遵循软件的审阅限制。可编辑范围仅限当前工程中已加载的源码；不能直接改写生成的分页文件、审阅记录或任意磁盘文件。`undo` 撤销最近一次源码或 CLI 修改；界面中的写作撤销仍可使用。

## 页面、保存与 PDF

```powershell
$state = .\pageweave.cmd status | ConvertFrom-Json
.\pageweave.cmd layout --paper a4paper --margin 25 --landscape false --revision $state.data.revision
$state = .\pageweave.cmd status | ConvertFrom-Json
.\pageweave.cmd save --revision $state.data.revision
.\pageweave.cmd compile --revision $state.data.revision --output result.pdf
```

纸张支持 `a4paper`、`a5paper`、`letterpaper`；页边距为 10–50 毫米。页面设置要求文稿已有 `geometry` 设置。PDF 编译使用独立快照，期间可以继续输入；返回的 revision 标识被编译的内容。省略 `--output` 时返回本机编译缓存中的 PDF 路径；指定的输出文件已存在时拒绝覆盖。

## 供 AI 工具使用

每条命令在 stdout 输出一个 JSON 对象，成功为 `{"ok":true,"data":...}`，失败为 `{"ok":false,"error":{"code":"...","message":"..."}}`。完整命令列表和退出码见 `help`。也可以把完整请求保存为 JSON，然后运行：

```powershell
.\pageweave.cmd request --input request.json
```

例如 `{"action":"read","file":"main.tex"}`。推荐流程是读取当前文稿，生成小范围修改，携带原 revision 提交，然后保存和编译检查。失败时检查 `error.code`；若响应包含 `data.applied: true`，说明内容已更新但后续同步或保存遇到错误，应重新读取状态。

CLI 使用本机命名管道及每次启动生成的连接凭据，不监听公网端口。连接记录保存在 PageWeave 的用户配置目录，不进入文稿和发布包。关闭软件后连接结束。默认连接同一配置目录中首先启动的实例；测试或独立实例可用 `PAGEWEAVE_USER_DATA` 指定软件配置目录，并用 `--profile DIR` 让 CLI 连接相同目录。CLI 不绕过恢复提示、正在输入的中文组合文本或打开的编辑对话框；这些情况返回错误，稍后重试。

实现依据：[Node.js 本地 IPC](https://nodejs.org/api/net.html#ipc-support)、[Electron Node 运行模式](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node)。
