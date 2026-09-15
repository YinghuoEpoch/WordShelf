# Privacy Policy / 隐私政策

**WordShelf（我的文库）** — Last updated: 2026-09-15

[English](#english) · [中文](#中文)

---

## English

WordShelf is a personal English reading and vocabulary tool developed by an independent developer (YinghuoEpoch / 荧惑纪). This policy explains what the app stores, what it sends over the network, and to whom.

### The short version

- The developer runs **no server** and **never receives any of your data**.
- Everything you create in the app — imported books and texts, notes, review progress, settings, and any API keys you enter — is stored **only on your device**.
- The app contains **no analytics, no advertising, no crash reporting, and no account system**.
- The app connects to the internet **only when you use a feature that needs it**, and only to the services listed below.

### Data stored on your device

- Books and texts you import (`.txt`, `.epub`) or download from the built-in library.
- Your notes (words, phrases, sentence excerpts), review progress, and reading positions.
- App settings (appearance, fonts, sync options).
- Credentials you choose to enter for optional features: an AI API key and endpoint, a cloud text-to-speech key, and WebDAV account details. **These are stored only on your device and are excluded from exported backup files.**
- Cached pronunciation audio (can be cleared in Settings).

All of this lives in the app's private storage. Uninstalling the app deletes it.

### Network connections the app makes

Each connection happens only when you trigger the corresponding feature.

| Feature | Service | What is sent |
|---|---|---|
| Built-in library (search / download books) | Project Gutenberg (gutenberg.org and its mirrors, gutenberg.net.au) | Your search terms and the ID of the book you download |
| Word pronunciation (human recordings) | Youdao Dictionary (dict.youdao.com) | The word you tapped |
| AI assistance (optional, your own key) | The AI provider **you** configure — any OpenAI-compatible endpoint (e.g. DeepSeek, Moonshot, or a local Ollama) | The word/phrase and its surrounding text; for "mark words in whole text", the text of the current document. That provider's privacy policy governs this data. |
| Cloud text-to-speech (optional, your own key) | Volcengine / ByteDance speech API, using your credentials | The text to be read aloud |
| Multi-device sync (optional, your own account) | The WebDAV server **you** configure (e.g. Nutstore / 坚果云) | Your library data (texts, notes, settings except credentials), uploaded to your own account |
| System text-to-speech | Your device's speech engine (on device) | Nothing leaves the device |

The developer has no access to any of these services on your behalf and cannot see what you send to them.

### Permissions

The app requests only the `INTERNET` permission. File import and export use the system file picker and do not require storage permissions.

### Children

The app is not directed at children under 13 and does not knowingly collect information from anyone.

### Your control

- Delete everything: uninstall the app, or clear its data in system settings.
- Data you synced to your own WebDAV account stays in that account; delete it there.
- Backups you export are plain JSON files under your control.

### Changes

Changes to this policy will be posted on this page with a new "last updated" date.

### Contact

qq3224018399@gmail.com

---

## 中文

**WordShelf（我的文库）** 是由独立开发者（荧惑纪 / YinghuoEpoch）开发的个人英文阅读与背单词工具。本政策说明本应用存储什么、向何处发送什么。

### 一句话版本

- 开发者**没有服务器**，**不会收到你的任何数据**。
- 你在应用里产生的一切——导入的书和文本、笔记、复习进度、设置、你填入的各类 Key——**只存在你自己的设备上**。
- 应用**没有统计分析、没有广告、没有崩溃上报、没有账号系统**。
- 应用**只在你使用需要联网的功能时**联网，且只连接下文列出的服务。

### 存在你设备上的数据

- 你导入的书和文本（`.txt`、`.epub`），以及从内置书库下载的书。
- 你的笔记（单词、短语、句摘）、复习进度、阅读位置。
- 应用设置（外观、字体、同步选项）。
- 你为可选功能自行填入的凭据：AI 接口地址与 Key、云端语音 Key、WebDAV 账号信息。**这些只存在本机，且不会写进导出的备份文件。**
- 发音录音缓存（可在设置里清理）。

以上全部位于应用的私有存储，卸载即删除。

### 应用会发起的网络连接

每一项连接只在你使用对应功能时发生。

| 功能 | 服务方 | 发送的内容 |
|---|---|---|
| 内置书库（搜索、下载） | 古腾堡计划（gutenberg.org 及其镜像、gutenberg.net.au） | 你的搜索词、你下载的书的编号 |
| 单词真人发音 | 有道词典（dict.youdao.com） | 你点击的那个单词 |
| AI 辅助（可选，自备 Key） | **你自己配置**的 AI 服务商——任意 OpenAI 格式接口（如 DeepSeek、Moonshot、本地 Ollama） | 该单词/短语及其上下文；「全文划词」时为当前文档的正文。这些数据受该服务商的隐私政策约束。 |
| 云端语音（可选，自备 Key） | 火山引擎语音接口，用你自己的凭据 | 要朗读的文本 |
| 多设备同步（可选，自备账号） | **你自己配置**的 WebDAV 服务（如坚果云） | 你的文库数据（文本、笔记、不含凭据的设置），上传到你自己的账号 |
| 系统语音 | 设备自带的语音引擎（本机） | 不出设备 |

开发者无法访问上述任何服务中属于你的内容，也看不到你发送了什么。

### 权限

应用只申请 `INTERNET`（联网）权限。文件导入导出走系统文件选择器，不需要存储权限。

### 儿童

本应用不面向 13 岁以下儿童，也不会有意收集任何人的信息。

### 你的控制权

- 删除全部数据：卸载应用，或在系统设置里清除应用数据。
- 你同步到自己 WebDAV 账号里的数据留在那个账号里，请在那里删除。
- 你导出的备份是普通 JSON 文件，由你自己保管。

### 变更

本政策如有修改，会在本页发布并更新「最后更新」日期。

### 联系

qq3224018399@gmail.com
