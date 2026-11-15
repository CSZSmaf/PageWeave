# 投稿模板

通过“新建 → 投稿模板”创建文稿，或在“布局 → 投稿模板”中为当前文稿选择版式。标题、作者、单位、摘要和关键词集中在同一个窗口；每行填写一位作者，单位用于这些作者共同的署名单位；ACM 另提供国家或地区字段，ICML 终稿和预印本提供通讯作者与邮箱字段。模板按期刊、会议、我的模板分类，支持名称搜索。

点击“开启实时预览”后，修改版式或论文信息会自动重新排版。确认后创建文稿或应用到当前文稿。应用模板保留已有正文、公式、图片和表格，可撤销。

## 可选模板

| 模板 | 版式与参考文献 | 官方说明 |
| --- | --- | --- |
| Springer Nature `sn-jnl` | 单栏、双栏；数字编号、作者–年份、Basic、Nature | [作者支持](https://www.springernature.com/gp/authors/campaigns/latex-author-support) |
| IEEE `IEEEtran` | 期刊双栏、单栏审阅稿；会议双栏；IEEE 数字编号 | [期刊](https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/authoring-tools-and-templates/tools-for-ieee-authors/)、[会议](https://www.ieee.org/conferences/publishing/templates.html) |
| Elsevier `elsarticle` | 审阅稿、单栏预印本、双栏 5p；数字编号、作者–年份 | [LaTeX 投稿说明](https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions) |
| Wiley New Journal Design v5 | Times 单栏、双栏；AMA、APA、Vancouver | [模板说明](https://authorservices.wiley.com/author-resources/Journal-Authors/Prepare/new-journal-design.html) |
| ICLR 2027 | 匿名审稿、终稿；会议规定的参考文献样式 | [作者指南](https://iclr.cc/Conferences/2027/AuthorGuidelines) |
| ACM `acmart` | 期刊 acmsmall、acmlarge、acmtog；会议 SIGCONF；单栏审阅稿；数字编号、作者–年份 | [ACM 模板](https://www.acm.org/publications/proceedings-template) |
| APS Physical Review `revtex4-2` | 双栏 reprint、单栏 preprint；APS 数字编号 | [REVTeX](https://journals.aps.org/revtex) |
| CVPR 2027 | 双栏匿名审稿、终稿 | [作者指南](https://cvpr.thecvf.com/Conferences/2027/AuthorGuidelines) |
| NeurIPS 2026 | 主会匿名审稿、终稿、预印本 | [官方模板入口](https://neurips.cc/Conferences/2026/CallForPapers) |
| ICML 2027 | 双栏匿名审稿、终稿、预印本 | [征稿与模板](https://icml.cc/Conferences/2027/CallForPapers) |
| ACL / EMNLP / NAACL | ACL 通用格式；匿名审稿、终稿、预印本 | [官方样式仓库](https://github.com/acl-org/acl-style-files) |
| IJCAI 2027 | 双栏匿名审稿、终稿 | [作者模板包](https://ijcai.org/authors_kit/) |

OpenReview 模板按具体会议与年份选择。投稿时根据目标期刊或会议的作者指南确定版式、参考文献和匿名要求；窗口中可直接打开相应官方说明。

## 复用与调整

在“保存版式为我的模板”中输入名称并保存，下次可以从“我的模板”直接选用。保存内容包括模板类型、单栏或双栏、参考文献样式、编译器和匿名选项；每篇论文分别填写标题、作者和摘要。匿名模式生成的作者栏和模板设置注释均使用匿名信息。

投稿文稿的写作视图提供连续单栏编辑页，正文输入、格式调整、公式和图表编辑沿用现有工具。PDF 预览采用官方类文件，显示最终分栏、标题、参考文献和分页。状态栏分别显示编辑页数与 PDF 页数；正文输入后仍会自动更新 PDF。

需要多单位署名、通讯作者、基金和其他期刊专用字段时，可在源码中添加官方模板相应命令。`PW-BODY-BEGIN` 与 `PW-BODY-END` 之间保留可视化正文；`PW-EXTRA-BEGIN` 与 `PW-EXTRA-END` 之间的自定义导言区在切换模板时保留。通过模板窗口重新应用版式会重新生成标题和作者区域。

## 编译与参考文献

默认使用 pdfLaTeX 生成英文投稿稿；中文内容和系统字体可选择 XeLaTeX。需要完整 TeX Live，以及 `latexmk`、`bibtex`。IEEE、Elsevier、ACM、APS 的类文件从本机 TeX 环境取得。其余模板首次选用时从官方地址获取文件，随后在本机缓存，可离线复用。

将 `.bib` 文件放入文稿目录，在“编译与参考文献”中填写相对路径，例如 `references.bib`。可在正文源码中写 `\cite{smith2024}`；使用 natbib 的模板还可写 `\citep{smith2024}`、`\citet{smith2024}`。写作视图显示引用键，PDF 自动生成引用编号或作者–年份和文末参考文献。

文稿保存为 `.tex` 及配套样式、资源。导出 LaTeX 工程会携带实际引用的类文件与参考文献，官方文件保留原版权声明；主文稿注释记录模板的官方来源。软件安装包仅包含模板适配代码。

ACM 文稿使用 `nonacm` 选项准备编辑稿，保留官方字体与版式。录用后可根据出版方提供的信息在源码中补充版权、DOI、会议和期刊元数据。APS 默认采用 PRA 参考版式，具体 Physical Review 期刊选项可在源码导言区调整。
