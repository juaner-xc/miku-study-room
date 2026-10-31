# 实验：保留原版视觉效果的透明桌面歌词层

**开发中，存在阻塞桌面鼠标点击的已知问题，尚未完成真实切换壁纸验收。请勿作为稳定版本安装或发布。**

目标是在 Wallpaper Engine 切换背景时，保留原版漂浮歌词、字体、胶囊播放器和设置面板，且不显示普通程序窗口边框。

## 已知问题

在开发机器上曾出现：切换 Wallpaper Engine 壁纸后无法点击桌面，退出本叠加层后恢复。此问题来自实验叠加层，不是已确认的原作者缺陷。

当前新增了内部浏览器窗口穿透保护、异常自动退出和 Ctrl + Alt + Esc 紧急退出，但仅通过隔离测试，**不代表真实桌面问题已经彻底修复**。

## 内容

- src/：透明桌面宿主、输入保护及配置迁移代码。
- player/js/app.js 与 player/css/style.css：基于作者新版发布包，保留原有模式和播放器布局；脚本增加“唱片”模式注册和生命周期调用。
- player/js/lyric-record.js、player/css/lyric-record.css：独立的透明唱片歌词效果，无鼠标事件、无新增动画帧循环。
- player/js/desktop-overlay.js、player/css/desktop-overlay.css：宿主兼容、透明背景及交互区域适配。
- tests/：区域边界策略与内部窗口保护的隔离测试。
- build.ps1：从微软官方 NuGet 获取固定版本 WebView2 SDK，编译到 dist/。
- test.ps1：运行屏幕外隔离测试，不操作用户桌面或切换壁纸。

背景视频和现有字体不在实验目录中重复提交。构建时复用仓库中的字体和演示封面。

## 构建和测试

需要 Windows 10 / 11、.NET Framework 4.8、Microsoft Edge WebView2 Runtime。

    powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\test.ps1

也可以指定自己解压的作者新版目录，以复用新版控制桥及设置程序：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -AuthorReleasePath "D:\Miku Study Room"

构建不会安装、启动叠加层或修改壁纸。仓库默认的旧版设置程序不包含作者新发布包中的快捷键设置界面；需要该界面时请指定新版发布包。

测试通过不代表真实桌面切换场景已通过验收。

## 唱片歌词

在原版设置面板中选择“歌词特效 → 唱片”。唱片环和唱针采用透明线条，当前歌词轻盈浮出，上一句上移淡去；跟随当前字体和主题色。暂停时停止唱片与逐字浮动；切换模式、切歌和拖动进度时清理旧歌词轨迹。

该效果只增加页面绘制，不增加原生窗口或鼠标交互区域，不改变当前叠加层仍存在的已知故障状态。

## 配置与来源

不提交个人 API 密钥、浏览器缓存、安装目录或运行日志。生成的 AI 配置默认关闭、密钥为空。

原项目：https://github.com/Crescent350234/miku-study-room

保留原项目关于素材仅限个人学习与自用的说明。本分支不新增背景视频，也不授予原项目素材的再分发或商用权限。WebView2 的许可与声明随本目录提供。
