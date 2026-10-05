# Contributing to LexiFilter

感谢你愿意改进 LexiFilter。

## 开发流程

1. Fork 仓库并创建 feature branch。
2. `npm install`。
3. `npm run dev` 本地验证。
4. 提交前运行 `npm run build`。
5. Pull Request 中说明：问题、修改方式、测试方式、是否改变数据格式。

## PDF / OCR 相关贡献

PDF 格式差异极大。请不要为了某一本词书写死页码或特定标题。优先：

- 改进通用解析规则；
- 将特殊规则做成可插拔 parser；
- 提供最小可复现样例；
- 不要提交有版权风险的整本商业词书。

## 数据兼容

当前备份格式 `AppState.version = 1`。如果修改持久化结构，请提供迁移逻辑，不要让升级后的用户无提示丢失学习记录。

## 隐私原则

默认保持 local-first。引入任何网络请求、遥测、第三方 API 或云同步前，应在 Issue / PR 中明确说明，并让用户可知、可控。
