# 墨稿 MoGao

在连续页面上写正文、编辑公式和设置格式的 Windows 桌面编辑器。文稿保存为 LaTeX 工程，后台生成正式 PDF。

## 下载与运行

从 [Releases](https://github.com/CSZSmaf/MoGao/releases) 下载 Windows x64 压缩包，完整解压后运行 `MoGao.exe`。请保留程序所在目录中的其他文件。

运行程序不需要 Node.js。PDF 排版需要本机安装 TeX Live，并让 `xelatex`、`latexmk` 和 `synctex` 可以通过 PATH 调用。写作模板使用 Windows 自带的宋体、微软雅黑等字体。当前验证环境为 Windows 11 x64、TeX Live 2025。

首次启动打开“入门教程”。点击“新建”可创建空白文稿，点击“打开”可选择已有 LaTeX 工程目录。

## 功能

- 连续输入、自动换行和分页，支持长段落跨页、跨页选择和删除后回流。
- 字体、字号、颜色、加粗、斜体、下划线，标题样式、段落对齐和行距。
- 行内公式和独立公式，可视化输入、LaTeX 表达式编辑、单独重建预览。
- 插入图片，调整宽度和对齐方式；插入表格、增删行列和设置表头。
- A4 / A5 / Letter 纸张、页边距、横向页面和手动分页。
- 写作、PDF、源码三种视图，支持多文件工程和编译日志。
- 写作与源码视图共用查找替换面板，支持大小写匹配、单次替换和全部替换。
- 字数与选区统计、撤销重做、工程保存、PDF 和 LaTeX 工程导出。

| 操作 | 快捷键 |
| --- | --- |
| 保存 | Ctrl+S |
| 查找 / 替换 | Ctrl+F / Ctrl+H |
| 下一处 / 上一处 | 查找面板中 Enter / Shift+Enter |
| 关闭查找 | Esc |
| 新段落 / 段内换行 | Enter / Shift+Enter |
| 分页符 | Ctrl+Enter |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Shift+Z 或 Ctrl+Y |

输入停顿后自动同步源码并更新 PDF，连续输入也会定期同步。编译不会移动正文光标或清除选区。自动同步不等于保存到磁盘；使用 Ctrl+S 保存，关闭窗口时会提示尚未保存的修改。

## 工程与适用范围

新文稿包含 `main.tex` 与 `mogao.sty`。图片与表格需要的 `mogao-tools.sty` 会随文稿一起保存，图片放在工程的 `images` 目录。工程可在应用外编译：

```powershell
latexmk -xelatex -interaction=nonstopmode main.tex
```

连续页面写作适用于正文采用 `MogaoBlock` 等已适配结构的工程。任意出版社模板不会自动转换，未适配内容通过源码和 PDF 视图编辑、查看。写作页面使用浏览器排版，最终 PDF 使用 LaTeX，断行和分页可能不同，导出以正式 PDF 为准。

表格采用等宽列，按整行分页，暂不支持合并单元格、嵌套表格、拖动列宽和单行跨页拆分。图片采用独立段落，暂不支持文字环绕。当前版本不支持任意现成 PDF 的结构重建或 DOCX 交换。

查找按普通文本匹配。写作视图查找正文和表格，不跨公式、图片、硬换行或单元格边界；源码视图查找当前文件。替换保留段落格式，新文字沿用匹配起点的字符格式。全部替换可一次撤销。

字数按中文逐字、英文和数字按词计算，包括标题和表格正文，不计公式、图片、源码命令及注释。

## 数据保存

文稿、应用设置和编译结果保存在本机。当前版本没有账户登录、遥测或云端上传功能。教程副本位于应用数据目录的 `papers`，编译副本位于 `builds` 和 `formula-builds`。可通过 `MOGAO_USER_DATA` 环境变量指定应用数据目录。

编译副本尚未自动清理，可在关闭软件后清理构建目录，请保留文稿目录。保存会检查外部文件修改，发生冲突时阻止覆盖。多文件保存逐文件原子替换，尚不提供整目录崩溃恢复。编译关闭 shell escape，并忽略工程的 `.latexmkrc`。

## 从源码运行

需要 Node.js 24 和 npm。PDF 编译测试还需要上述 TeX Live 环境。

```powershell
git clone https://github.com/CSZSmaf/MoGao.git
cd MoGao
npm ci
npm run dev
```

```powershell
npm test
npm run test:integration
npm run build
npm run package
```

打包结果位于 `release/win-unpacked/`。可以使用 `MoGao.exe --project="<工程目录>"` 打开指定工程。

## 目录

- `src/writing/`：连续页面、格式工具、公式编辑。
- `src/search/`：共用查找面板和两种编辑器适配。
- `core/`：文稿转换、工程事务、编译和统计。
- `electron/`：桌面窗口与本地文件接口。
- `examples/`：通用教程和可独立编译的模板。
- `tests/`：单元测试和真实 LaTeX 编译测试。

[实现说明](docs/IMPLEMENTATION.md) · [验证范围](docs/VALIDATION.md) · [第三方许可](THIRD_PARTY_NOTICES.txt)
