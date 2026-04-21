# 克莱蒙英语管理端

面向校区管理员的 Web 后台，基于 `React + Vite + Supabase` 构建。

## 当前范围

- 校区管理员登录与会话保持
- 校区、班级、教师、学员、作业概览
- 教师账号创建
- 学生账号创建并绑定班级
- 统一调用 Supabase Edge Function 做安全建号
- GitHub Actions Web 构建

## 技术栈

- `React`
- `Vite`
- `React Router`
- `Supabase`

## 本地开发

```bash
npm install
npm run dev
```

默认端口是 `4175`。

## 环境变量

复制 `.env.example` 到 `.env`，并填写：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

生产环境可参考：

- `.env.production.example`

## GitHub Actions

工作流文件：

- `.github/workflows/web-build.yml`

仓库需要配置：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

## 部署

国内服务器 + `Nginx Proxy Manager` 部署步骤见：

- [docs/nginx-proxy-manager-deploy.md](/Volumes/移动磁盘/peixun%20/management_app/docs/nginx-proxy-manager-deploy.md)

## 相关仓库

- 学生端：[claremont-english-student-app](https://github.com/xiaoguan521/claremont-english-student-app)
- 教师端：[claremont-english-teacher-app](https://github.com/xiaoguan521/claremont-english-teacher-app)
- 管理端：[claremont-english-management-app](https://github.com/xiaoguan521/claremont-english-management-app)
