# LexiFilter

> 把“背完整本词书”变成“先筛出真正不会的词，再集中背”。

LexiFilter 是一个 **local-first、浏览器端运行** 的开源词汇筛选与复习工具。用户可以上传自己的 PDF 词本，程序提取“词 / 释义”，在导入前提供校对，然后通过 **熟悉 / 模糊 / 不会** 三档快速筛选，最后只反复复习自己的弱词。

它最初来自一个很具体的需求：面对一份约 1500 词的考试词表，其中很多词已经掌握，不值得重新平均用力。这个项目把这个工作流泛化成任何人都能使用的工具。

## 功能

- **PDF 词本导入**：使用 PDF.js 读取带文本层的 PDF。
- **扫描件 OCR 兜底**：页面几乎没有文本时，可用 Tesseract.js 在浏览器中 OCR。
- **导入前校对**：自动解析并不假设 100% 正确；用户可在正式导入前修改、取消错误词条。
- **三档筛词**：熟悉 / 模糊 / 不会；支持 `Space`、`1`、`2`、`3` 键快速操作。
- **弱词复习**：只复习“模糊 + 不会”，错误次数多的词优先。
- **四选一测试**：从弱词中抽题，答错累计错误次数。
- **自定义学习周期**：2–365 天任意设置，并指定最后 N 天专门复习。
- **动态日目标**：某天多学或少学后，后续目标根据剩余量自动调整。
- **本地持久化**：IndexedDB 保存词库、评级、计划和错误次数；无账号、无后端。
- **备份与导出**：完整 JSON 备份；全部词 / 弱词 CSV 导出。
- **GitHub Pages 可部署**：纯静态前端，不需要服务器。

## 技术栈

- TypeScript + Vite
- Mozilla PDF.js (`pdfjs-dist`)：PDF 文本提取与页面渲染
- Tesseract.js：扫描页 OCR
- IndexedDB：学习数据本地持久化
- 无 UI 框架，便于阅读和二次开发

## 本地开发

需要 Node.js 20+（推荐当前 LTS）。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## GitHub Pages

仓库已经包含 `.github/workflows/deploy.yml`。推送到 `main` 后，在 GitHub 仓库：

1. 打开 **Settings → Pages**；
2. Source 选择 **GitHub Actions**；
3. 再次 push 或手动运行 `Deploy to GitHub Pages` workflow。

`vite.config.ts` 使用相对 `base: './'`，因此可以部署到 `username.github.io/repository-name/` 子路径。

## PDF 解析策略

LexiFilter 不把“PDF 识别”包装成万能 AI。当前策略是：

1. PDF.js 读取每页文本层；
2. 如果选择“自动 OCR”，某页文本过少时将该页渲染为 Canvas；
3. Tesseract.js 对 Canvas 做 OCR；
4. 解析器按常见词表格式识别，例如：

```text
1. account 账户
bankruptcy 破产
letter of credit 信用证
```

5. 合并重复词头；
6. 用户在“导入前校对”页面确认后才写入正式词库。

### 已知限制

PDF 的排版没有统一标准。双栏、表格、复杂页眉页脚、词和释义跨行、纯图片、特殊字体编码都可能降低自动解析准确率。因此 **校对页是产品设计的一部分，不是临时补丁**。

OCR 比文本层提取慢得多，并且首次 OCR 需要加载 Tesseract worker / core / language data。默认实现的识别发生在浏览器本地，但依赖包可能从其默认资源地址下载运行文件或语言模型。如果你需要完全离线/内网部署，可以把这些资源自托管，并在 `src/pdf.ts` 中配置 worker/core/lang 路径。

## 数据与隐私

LexiFilter 没有自己的后端：

- PDF 由浏览器读取；
- 学习数据写入当前浏览器 IndexedDB；
- 不需要账号；
- 不内置遥测或分析 SDK；
- 用户可以导出 JSON 自己保管数据。

注意：**浏览器本地数据并不等于永久备份**。清除站点数据、切换浏览器/域名或浏览器配置文件会导致本地记录不可见，因此建议定期导出 JSON。

## 项目结构

```text
src/
├── app.ts        # 页面、交互、学习流程
├── pdf.ts        # PDF.js + OCR 提取
├── parser.ts     # “词 / 释义”启发式解析与去重
├── planner.ts    # 自定义天数与动态日目标
├── storage.ts    # IndexedDB 持久化
├── export.ts     # JSON / CSV 导出
├── types.ts      # 数据模型
└── styles.css    # UI
```

## Roadmap

适合后续社区贡献的方向：

- [ ] CSV / XLSX 直接导入
- [ ] 更强的双栏、表格 PDF 解析
- [ ] OCR 页面范围选择与取消按钮
- [ ] 多词本管理，而不是单个活动词本
- [ ] PWA / 离线缓存
- [ ] 自托管 OCR 资源的一键配置
- [ ] 多语言 UI
- [ ] 可插拔 parser：让不同词书格式实现自己的解析器
- [ ] 单元测试与真实 PDF fixture 测试
- [ ] 无障碍与移动端手势

## 贡献

欢迎 Issue 和 Pull Request。解析器相关 PR 最好附一个**脱敏的小样本文本或可公开测试 PDF**，并说明期望识别结果。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT。第三方依赖遵循各自许可证；PDF.js 与 Tesseract.js 均采用 Apache-2.0。
