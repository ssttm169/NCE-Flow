<p align="center">
  <a href="https://nce.luzhenhua.cn">
    <img src="https://github.com/luzhenhua/NCE-Flow/assets/your_logo.png" alt="NCE Flow" width="120">
  </a>
</p>

<h1 align="center">NCE Flow</h1>

<p align="center">
  <strong>新概念英语在线点读，点句即读、连续播放</strong>
</p>

<p align="center">
  <a href="https://nce.luzhenhua.cn">在线体验</a> •
  <a href="https://github.com/luzhenhua/NCE-Flow/releases">下载完整版</a> •
  <a href="https://github.com/luzhenhua/NCE-Flow/issues">问题反馈</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/luzhenhua/NCE-Flow?style=social" alt="GitHub stars">
  <img src="https://img.shields.io/github/forks/luzhenhua/NCE-Flow?style=social" alt="GitHub forks">
  <img src="https://img.shields.io/github/release/luzhenhua/NCE-Flow" alt="GitHub release">
  <img src="https://img.shields.io/github/license/luzhenhua/NCE-Flow" alt="License">
  <img src="https://img.shields.io/github/issues/luzhenhua/NCE-Flow" alt="GitHub issues">
</p>

<p align="center">
  <em>简约 · 高效 · 专注｜零依赖 · 纯静态 · 即开即用</em>
</p>

---

## 功能特性

### 🎯 智能点读系统
- **句子级点读**：点击任意句子，从该句开始连续播放
- **自动跟随**：播放时自动高亮并居中当前句子
- **播放控制**：连读/点读模式自由切换
- **倍速调节**：0.75x - 2.5x 播放速度可调
- **断点续播**：智能记忆上次学习位置

### 🌐 多语言支持
- **EN 模式**：纯英文显示
- **EN+CN 模式**：双语对照显示
- **CN 模式**：纯中文显示
- **设置持久化**：语言偏好自动保存

### 🎨 现代化界面
- **Apple 风格**：采用 iOS 设计语言，简约优雅
- **深浅色主题**：自动适配系统主题，护眼舒适
- **流畅动画**：精心设计的过渡效果和微交互
- **响应式设计**：完美适配桌面、平板、手机

### 📚 学习管理
- **课程收藏**：标记重要课程，快速访问
- **学习记录**：记录学习历史和进度
- **课程导航**：便捷的上一课/下一课切换

### ⚡ 技术优势
- **零依赖**：纯 HTML/CSS/JavaScript，无需框架
- **即开即用**：解压后直接打开 `index.html` 即可
- **完整音频**：NCE1-NCE4 四册完整音频资源
- **多平台部署**：支持 Vercel、Cloudflare、GitHub Pages 等

---

## 演示截图

<p align="center">
  <img src="https://github.com/luzhenhua/NCE-Flow/assets/your_screenshot_1.png" alt="NCE Flow 首页" width="800">
</p>

<p align="center">
  <img src="https://github.com/luzhenhua/NCE-Flow/assets/your_screenshot_2.png" alt="NCE Flow 课文点读" width="800">
</p>

---

## 快速开始

### 方式一：下载完整版（推荐）

<div align="center">

[![下载按钮](https://img.shields.io/badge/下载完整版-blue?style=for-the-badge)](https://github.com/luzhenhua/NCE-Flow/releases/download/v1.0.0/NCE-Flow-v1.0.0.zip)

**NCE-Flow-v1.0.0.zip (583MB) - 包含完整音频文件**

</div>

1. 下载压缩包并解压
2. 双击打开 `index.html`
3. 开始学习！

### 方式二：Git Clone

```bash
git clone https://github.com/luzhenhua/NCE-Flow.git
cd NCE-Flow
# 使用本地服务器启动（推荐）
python3 -m http.server 8080
# 访问 http://localhost:8080
```

### 方式三：在线体验

直接访问：https://nce.luzhenhua.cn

---

## 项目结构

```
NCE-Flow/
├── assets/                 # 样式与脚本
│   ├── styles.css         # 主样式文件
│   ├── app.js             # 应用核心逻辑
│   └── lesson.js          # 播放控制逻辑
├── static/
│   └── data.json          # 课程元数据
├── NCE1~NCE4/             # 四册教材资源
│   ├── *.mp3              # 音频文件
│   └── *.lrc              # 字幕文件
├── index.html             # 首页导航
├── lesson.html            # 课文点读页
└── README.md              # 项目文档
```

---

## 使用指南

### 选择课程
1. 在首页选择要学习的册别（NCE1-NCE4）
2. 浏览课程列表，点击要学习的课程
3. 使用收藏功能标记重要课程

### 开始学习
1. **选择语言模式**：EN / EN+CN / CN
2. **点击句子**：从任意句子开始播放
3. **控制播放**：调节速度、切换连读/点读模式
4. **切换课程**：使用上一课/下一课导航

### 个性化设置
- **播放速度**：0.75x - 2.5x 可调
- **自动跟随**：开启/关闭句子自动跟随
- **播放模式**：连读模式 vs 点读模式
- **界面主题**：自动适配系统浅色/深色主题

---

## 技术实现

### 前端技术栈
- **HTML5**：语义化标记，无障碍访问
- **CSS3**：现代样式，支持深色模式、动画效果
- **JavaScript ES6+**：模块化开发，无第三方依赖
- **Web Audio API**：精确的音频播放控制
- **LocalStorage**：用户偏好设置持久化

### 核心功能
- **LRC 解析引擎**：支持多种字幕格式
- **时间轴同步**：毫秒级精度的音频字幕同步
- **响应式布局**：适配各种屏幕尺寸
- **性能优化**：音频预加载、播放缓冲优化

---

## 版本历史

### v1.0.0
- **正式发布**：UI 全面调整，界面更加现代化
- **新增功能**：句子跟随/不跟随选项
- **完善体验**：整体交互优化和细节改进

### v0.0.4
- **学习记录**：记录学习历史和上次观看位置
- **用户体验**：优化首页显示上次学习进度

### v0.0.3
- **课程收藏**：支持收藏重要课程
- **播放模式**：新增点读/连读设置功能
- **界面优化**：改进收藏按钮和播放控制

### v0.0.2
- **断点续播**：智能记忆上次播放位置
- **倍速功能**：支持 0.75x - 2.5x 播放速度调节

### v0.0.1
- **基础功能**：EN/EN+CN/CN 三态语言切换
- **完整资源**：NCE1-NCE4 四册音频资源
- **核心体验**：句子级点读和连续播放

---

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. **Fork** 本仓库
2. **创建** 你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. **提交** 你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. **推送** 到分支 (`git push origin feature/AmazingFeature`)
5. **创建** Pull Request

### 报告问题
- 使用 [Issues](https://github.com/luzhenhua/NCE-Flow/issues) 报告 bug
- 提供详细的问题描述和复现步骤
- 包含截图或录屏会更有帮助

---

## 致谢

- **原项目灵感**：[iChochy/NCE](https://github.com/iChochy/NCE)
- **贡献者**：[reaishijie](https://github.com/reaishijie) 的 PR 支持

---

## 免责声明

**重要声明：本网站的内容仅限个人学习、研究或欣赏之用，完全没有丝毫商业用途。**

- 本项目仅作为辅助正版新概念英语的学习工具
- 音频与文本内容的版权归原权利人所有
- 严禁用于任何商业目的或未经授权的传播
- 使用本项目即表示您同意上述条款

### 支持正版

**为尊重和保护著作权人的合法权益，我们强烈建议用户：**

- 购买合法授权的新概念英语正版教材
- 使用官方授权的学习资源和平台
- 支持原创作者和教育出版社
- 本项目仅作为正版教材的补充学习工具

---

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

<div align="center">

**如果这个项目对你有帮助，请给个 Star 支持一下！**

[回到顶部](#-nce-flow)

Made with ❤️ by [Luzhenhua](https://luzhenhua.cn)

</div>

---

## Star 历史

<p align="center">
  <a href="https://star-history.com/#luzhenhua/NCE-Flow&Date">
    <img src="https://api.star-history.com/svg?repos=luzhenhua/NCE-Flow&type=Date" alt="Star History Chart">
  </a>
</p>