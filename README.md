# NCE Flow

**新概念英语在线点读，点句即读、连续播放**

[![GitHub stars](https://img.shields.io/github/stars/luzhenhua/NCE-Flow?style=social)](https://github.com/luzhenhua/NCE-Flow)
[![GitHub forks](https://img.shields.io/github/forks/luzhenhua/NCE-Flow?style=social)](https://github.com/luzhenhua/NCE-Flow)
[![GitHub release](https://img.shields.io/github/release/luzhenhua/NCE-Flow)](https://github.com/luzhenhua/NCE-Flow/releases)
[![License](https://img.shields.io/github/license/luzhenhua/NCE-Flow)](LICENSE)

**在线体验**: https://nce.luzhenhua.cn | **下载完整版**: [Releases](https://github.com/luzhenhua/NCE-Flow/releases)

## 核心功能

- **句子级点读**：点击任意句子开始播放，自动高亮跟随
- **多语言视图**：EN / EN+CN / CN 三种显示模式
- **播放控制**：倍速调节、连读/点读切换、循环模式、断点续播
- **全局快捷键**：空格播放/暂停、方向键导航、音量控制
- **学习管理**：课程收藏、学习记录、进度追踪
- **现代界面**：Apple 风格、深浅色主题、响应式设计
- **零依赖**：纯静态文件，解压即用

## 快速开始

### 方式一：Docker 一键部署（最简单）

只需一条命令，无需下载代码：

```bash
docker run -d -p 8080:80 --name nce-flow --restart unless-stopped luzhenhua/nce-flow:latest
```

然后访问 `http://localhost:8080` 即可！

**自定义端口：**
```bash
docker run -d -p 3000:80 --name nce-flow --restart unless-stopped luzhenhua/nce-flow:latest
```

详细的 Docker 部署说明请查看 [DOCKER.md](DOCKER.md)

### 方式二：Docker Compose 部署

适合需要自定义配置的场景：

```bash
# 克隆项目
git clone https://github.com/luzhenhua/NCE-Flow.git
cd NCE-Flow

# 启动服务
docker-compose up -d

# 访问 http://localhost:8080
```

### 方式三：本地开发服务器

1. **下载完整版**：[访问 Releases 页面](https://github.com/luzhenhua/NCE-Flow/releases)
2. 解压后启动本地服务器：

   **方法一：使用Python**
   ```bash
   # 在解压后的文件夹中打开终端，运行：
   python -m http.server 8000
   # 然后访问：http://localhost:8000
   ```

   **方法二：使用Node.js**
   ```bash
   # 在解压后的文件夹中运行：
   npx serve .
   # 然后访问显示的本地地址
   ```

   **方法三：使用VSCode的Live Server插件**
   - 安装Live Server插件
   - 右键点击 `index.html`，选择"Open with Live Server"

3. 在浏览器中打开显示的本地地址，开始学习！

**注意**：不能直接双击 `index.html` 文件，会因为浏览器安全策略导致无法加载数据文件。

## 项目结构

```
NCE-Flow/
├── assets/          # 样式与脚本
├── static/          # 课程数据
├── NCE1~NCE4/       # 四册音频和字幕
├── index.html       # 首页
├── lesson.html      # 课文页
└── README.md        # 说明文档
```

## 版本历史

查看完整更新日志：[Releases](https://github.com/luzhenhua/NCE-Flow/releases)

### 最新版本

- **v1.3.3** (2025-10-20)：返回按钮修复 - 修复课程页面返回按钮行为
- **v1.3.2** (2025-10-19)：UI 增强与问题修复 - 快捷键面板优化、版本号显示、面板切换修复
- **v1.3.1** (2025-10-19)：布局优化 - 修复课程导航按钮布局问题
- **v1.3.0** (2025-10-19)：循环模式支持 - 新增单句循环和整篇循环功能
- **v1.2.0** (2025-10-19)：全局快捷键支持 - 空格键、方向键、音量控制等快捷操作
- **v1.1.4** (2025-10-18)：Docker 部署支持 - 一键部署，更便捷的使用方式
- **v1.1.3** (2025-10-18)：稳定性改进 - Bug 修复和代码优化
- **v1.1.1** (2025-10-17)：播放逻辑优化 - iOS Safari 兼容性增强
- **v1.1.0** (2025-10-17)：UI 优化与自动跳转 - 自动续播下一课功能
- **v1.0.0** (2025-10-11)：完整版发布 - 包含全部四册内容和音频文件

## 免责声明

**重要声明：本项目的内容仅限个人学习、研究或欣赏之用，完全没有丝毫商业用途。**

- 本项目仅作为辅助正版新概念英语教材的学习工具
- 音频与文本内容的版权归原著作权人所有
- 严禁用于任何商业目的或未经授权的传播
- 使用本项目即表示您同意上述条款

### 支持正版

本人在学习过程中使用的是正版新概念英语教材。为了帮助同样热爱新概念英语的广大英语学习者受益，特开发此辅助学习工具。

**为保护著作权人的权益，请在使用本站前购买正版教材：**

- 购买合法授权的新概念英语正版教材
- 使用官方授权的学习资源和平台
- 支持原创作者和教育出版社
- 本项目仅作为正版教材的补充学习工具

欢迎著作权人对本项目批评指导。如有任何版权问题或影响到您的合法权益，请联系：luzhenhuadev@qq.com，我们将立即处理。

## 致谢

感谢以下项目和个人的贡献：

- **[@reaishijie](https://github.com/reaishijie)** - 提交了 [PR #3](https://github.com/luzhenhua/NCE-Flow/pull/3)，为课文页面增加了播放速度控制按钮及播放速度持久化功能
- **[@iChochy](https://github.com/iChochy)** - [NCE 项目](https://github.com/iChochy/NCE/) 整理和提供了完整的新概念英语学习资料，包括封面图片、MP3 音频文件和 LRC 字幕文件，为本项目提供了宝贵的基础资源

感谢所有为本项目点赞、提出建议和反馈的朋友们！

## 许可证

[MIT License](LICENSE)

---

如果这个项目对你有帮助，请给个 Star ⭐ 支持一下！

你也可以通过 [爱发电](https://afdian.com/a/luzhenhua) ☕ 请我喝杯咖啡

Made with ❤️ by [Luzhenhua](https://luzhenhua.cn)
