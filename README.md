# PageWeave

在连续页面上写正文、编辑公式和设置格式的 Windows 桌面编辑器。文稿保存为 LaTeX 工程，后台生成 PDF。

## 下载

从 [Releases](https://github.com/CSZSmaf/PageWeave/releases) 下载 Windows x64 压缩包，完整解压后运行 `PageWeave.exe`。

无需安装 Node.js。PDF 排版需要 TeX Live，并将 `xelatex`、`latexmk`、`synctex` 加入 PATH。模板使用 Windows 自带的宋体等字体。

## 功能

- 连续输入、自动换行和分页，支持字体、字号、颜色及段落格式。
- 项目符号和编号列表、嵌套缩进、清除文字格式。
- 行内与独立公式，可视化编辑、LaTeX 输入和单独重建预览。
- 插入图片和表格，调整图片宽度，增删表格行列。
- 写作、PDF、源码视图，查找替换和字数统计。
- 审阅修订、逐项或全部接受与拒绝，以及选中文字添加批注。
- 保存、另存为、撤销重做，导出 PDF 和 LaTeX 工程。
- 自动保存与异常退出恢复，外部文件发生冲突时恢复为独立副本。
- 可自行配置 OpenAI、DeepSeek、Gemini 或兼容接口，用于对话、草稿和排版建议。

## 使用

“打开”默认选择 `.tex`（LaTeX）文件；旁边的下拉菜单可打开整个工程文件夹。打开单个文件时会加载它直接引用的本地图片、章节、参考文献和样式。通过宏动态选择资源或引用上级目录的复杂模板，应打开完整工程文件夹。

顶部显示当前文稿的实际文件名，包含 `.tex` 后缀；点击名称可重命名、另存为或打开所在文件夹。重命名会更新磁盘文件及审阅记录，保留编辑历史。正文标题不会改变文件名。

首次启动打开教程文件；“新建”默认名称为 `未命名.tex`，可选择名称和保存位置，创建空白正文及所需样式文件。“另存为”会创建独立工程目录并切换到副本。已有文件和自定义样式不会被覆盖。

可打开的文稿格式为 `.tex`。工程中的 `.sty`、`.cls`、`.bib` 等资源可在源码视图中编辑；PNG、JPEG、PDF 等图片作为排版资源加载。PDF 是编译和导出的成稿格式，目前不支持直接编辑任意 PDF，也不支持打开 `.docx`、`.doc` 作为可编辑文稿。

| 操作 | 快捷键 |
| --- | --- |
| 保存 / 另存为 | Ctrl+S / Ctrl+Shift+S |
| 查找 / 替换 | Ctrl+F / Ctrl+H |
| 新建批注 | Ctrl+Alt+M |
| 下一处 / 上一处 | 查找面板中 Enter / Shift+Enter |
| 新段落 / 换行 | Enter / Shift+Enter |
| 分页符 | Ctrl+Enter |
| 列表缩进 / 减少缩进 | Tab / Shift+Tab |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Y |

文稿与编译结果保存在本机。输入后自动更新排版，短暂停顿后自动保存；持续输入时也会定时保存。Ctrl+S 可立即保存。异常退出后，再次打开会提示恢复尚未存盘的内容；磁盘文件已被外部修改时，恢复为独立副本。恢复记录写入前最后一小段输入仍可能丢失。

在“审阅”中开启修订，右侧窗格显示修改前后的内容。修订按段落或连续修改的内容块处理，支持文字、格式、公式、列表、图片和表格。批注可编辑、解决、重新打开或删除。

批注和修订保存在工程内的 `pageweave-review.json`，保存、另存为和导出工程时一并保留。PDF 按当前正文导出，不显示审阅标记。编辑正文源码前需关闭修订并处理待审修改；批注在源码修改后会重新定位，无法确定位置时保留原文引用。

连续写作适用于已适配的 LaTeX 工程；普通模板通过源码与 PDF 视图编辑。适配文稿通过 `pageweave-layout.sty` 和自动生成的 `pageweave-pages.tex` 共用换页位置，正文源码仍保留段落结构。修改源码或样式后，旧分页记录自动失效；返回写作视图会重新计算。两种排版引擎的字形与断行仍可能略有差别。当前不支持任意 PDF 结构重建、DOCX 交换、图片环绕和合并单元格。

## AI 接口

点击右上角“AI”，选择服务并填写 API 基础地址、模型名称和密钥。OpenAI 使用 [Responses](https://developers.openai.com/api/docs/guides/text)，DeepSeek 和兼容接口使用 [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)，Gemini 使用 [generateContent](https://ai.google.dev/api/generate-content)。兼容接口的地址应包含服务要求的版本路径，例如 `/v1`。

只有点击“发送”才发起请求。发送内容为当前对话；勾选“附带选中文字”时，还会发送选中的文本。草稿可预览后插入文末；排版建议可应用到选中文字，支持撤销。文稿在生成期间发生修改时，需要重新生成排版建议。

密钥可通过系统密钥存储加密保存在本机，或仅在本次运行中使用；不会写入文稿和导出工程。更换服务或 API 地址后需重新填写密钥。对话仅保留在当前窗格会话中。接口费用、模型权限和服务可用性由所配置的服务决定。

## 从源码运行

需要 Node.js 24。

```powershell
git clone https://github.com/CSZSmaf/PageWeave.git
cd PageWeave
npm ci
npm run dev
```

`npm run package` 生成 Windows 目录版，输出到 `release/win-unpacked/`。

## 版权与许可

Copyright © 2026 [CSZSmaf](https://github.com/CSZSmaf)。项目采用 [Apache-2.0](LICENSE)，署名与适用范围见 [版权声明](COPYRIGHT)。

第三方组件遵循各自的许可证，见 [第三方许可](THIRD_PARTY_NOTICES.txt)。
