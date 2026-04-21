# 管理端部署清单

本文档用于把管理端部署到国内服务器，并通过 `Nginx Proxy Manager` 暴露为正式域名。

推荐域名：

- `admin.201807.xyz`

## 一、准备文件

在服务器上准备一个独立目录，例如：

```bash
mkdir -p /data/www/claremont-management
```

把管理端代码拉到服务器后，在项目目录执行：

```bash
npm install
cp .env.production.example .env.production
npm run build
```

构建完成后，会得到：

- `dist/`

建议把 `dist` 内容同步到：

```bash
/data/www/claremont-management/dist
```

## 二、生产环境变量

编辑：

- `.env.production`

当前可直接填写：

```env
VITE_SUPABASE_URL=https://ckgiwlblwkzenkxkbujx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_HQKz2j-33HdUcO6s5IrFoQ_rYgZeRCK
```

然后重新执行：

```bash
npm run build
```

## 三、Nginx Proxy Manager 配置

### 方案 A：有独立静态站点服务

如果你已经有一个本地 Nginx 在提供：

- `http://127.0.0.1:8085`

并且这个 Nginx 的根目录指向：

- `/data/www/claremont-management/dist`

那么在 `Nginx Proxy Manager` 里新建一个 `Proxy Host`：

- Domain Names: `admin.201807.xyz`
- Scheme: `http`
- Forward Hostname / IP: `127.0.0.1`
- Forward Port: `8085`

SSL：

- 开启 `Block Common Exploits`
- 开启 `Websockets Support`
- 开启 `Force SSL`

### 方案 B：直接用 NPM 前面的 Nginx 托管静态目录

如果你是在宿主机自己维护 Nginx，也可以给管理端单独配一个 server：

```nginx
server {
    listen 8085;
    server_name _;

    root /data/www/claremont-management/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

然后再由 `Nginx Proxy Manager` 反代到 `127.0.0.1:8085`。

## 四、部署后检查

访问：

- `https://admin.201807.xyz`

重点验证：

1. 登录页能正常打开
2. 管理账号 `admin@claremont.local / Gwj@5952` 能登录
3. 校区 AI / 语音配置页能读取配置
4. AI 队列看板能读取数据
5. 学员 / 教师页能执行账号管理动作

## 五、更新流程

后续更新管理端时：

```bash
git pull
npm install
npm run build
```

如果静态目录已直接指向最新 `dist`，通常不需要改 NPM 配置。
