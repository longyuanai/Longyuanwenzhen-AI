# 上传到 Google Drive 分发指南

适用于发布者（博士）。朋友/用户拿到链接后只需下载，参见 README.md。

---

## 为什么用 Google Drive

| 维度 | 百度网盘 | Google Drive |
|------|---------|-------------|
| 审核 | 经常审核延迟（命理类内容可能被屏蔽） | 无审核 |
| 国际访问 | 国内快，国外慢 | 全球快（需梯子） |
| 免费空间 | 5GB | **15GB** |
| 分享链接 | 需要密码+提取码 | **直接链接，可设置无密码** |
| 限速 | 非会员限速严重 | 不限速 |

---

## 上传步骤（5 分钟）

### 1. 准备好 zip 包

```bash
# 在打包目录下
ls -lh bazi-ziwei-mingli-skill-v8.5.zip
# 约 60MB
```

### 2. 登录 Google Drive

`https://drive.google.com`

### 3. 上传

直接拖进浏览器，或点击 "新建" → "文件上传"。

### 4. 设置分享

上传完成后：
- 右键文件 → "共享"
- 改为 "拥有链接的任何人"
- 权限选 "查看者"
- 复制链接

链接格式：
```
https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing
```

### 5. （可选）转换为直接下载链接

把链接里的 `view?usp=sharing` 换成 `uc?id=` + FILE_ID：

```
原始：https://drive.google.com/file/d/1aB2cD3eF4gH5iJ6kL7m/view?usp=sharing
直链：https://drive.google.com/uc?export=download&id=1aB2cD3eF4gH5iJ6kL7m
```

直链可以用 wget/curl 直接下载（小于 100MB 文件）。

---

## 朋友的下载方式

### 方式 A：浏览器（最简单）

1. 打开分享链接
2. 右上角下载按钮
3. 解压

### 方式 B：命令行（适合开发者）

```bash
# 安装 gdown
pip install gdown

# 用 file ID 下载
gdown 1aB2cD3eF4gH5iJ6kL7m

# 或用完整链接
gdown "https://drive.google.com/uc?id=1aB2cD3eF4gH5iJ6kL7m"
```

### 方式 C：无梯子用户

如果朋友在国内无梯子，可以：
- 用 IDM/迅雷等下载工具（部分支持代理）
- 或博士提供镜像链接（如阿里云盘 / 夸克网盘 / GitHub Release 中转）

---

## 镜像备份建议

主链接 Google Drive 之外，建议同时上传到：

1. **GitHub Release**（无限带宽，但单文件 < 2GB）
   - 创建 release → 上传 zip 作为 asset
   - 国内访问可用 ghproxy.com 加速

2. **HuggingFace**（数据集 / 模型场景）
   - 不太合适命理内容

3. **个人 OSS**（阿里云 / 腾讯云）
   - 国内访问最快
   - 但要花钱

---

## 更新版本

每次发新版：
1. 上传新 zip（保留同一个 file ID 不变 → 用 "管理版本" 功能）
2. 或上传新文件，废弃旧链接

Google Drive 支持版本管理：右键 → "管理版本" → 上传新版本，链接不变。

---

## 删除/下架

如果收到 DMCA 投诉或要下架：
- 在 Drive 中删除文件即可，链接立即失效
- 7 日内删除是行业惯例，可写入 README 版权声明
