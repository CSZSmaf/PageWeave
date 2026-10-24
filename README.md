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
- 保存、另存为、撤销重做，导出 PDF 和 LaTeX 工程。

## 使用

首次启动显示入门教程；点击“新建”创建空白文稿。“保存”旁的下拉菜单提供“另存为”，会创建独立工程并切换到副本。

| 操作 | 快捷键 |
| --- | --- |
| 保存 / 另存为 | Ctrl+S / Ctrl+Shift+S |
| 查找 / 替换 | Ctrl+F / Ctrl+H |
| 下一处 / 上一处 | 查找面板中 Enter / Shift+Enter |
| 新段落 / 换行 | Enter / Shift+Enter |
| 分页符 | Ctrl+Enter |
| 列表缩进 / 减少缩进 | Tab / Shift+Tab |
| 撤销 / 重做 | Ctrl+Z / Ctrl+Y |

文稿与编译结果保存在本机。输入后自动更新排版，使用 Ctrl+S 保存到磁盘。

连续写作适用于已适配的 LaTeX 工程；普通模板通过源码与 PDF 视图编辑。写作页面和最终 PDF 的断行可能不同。当前不支持任意 PDF 结构重建、DOCX 交换、图片环绕和合并单元格。

## 从源码运行

需要 Node.js 24。

```powershell
git clone https://github.com/CSZSmaf/PageWeave.git
cd PageWeave
npm ci
npm run dev
```

`npm run package` 生成 Windows 目录版，输出到 `release/win-unpacked/`。

[第三方许可](THIRD_PARTY_NOTICES.txt)
