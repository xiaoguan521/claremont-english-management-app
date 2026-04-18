# 克莱蒙英语管理端

基于 `React + Vite + Supabase` 的校区管理后台，当前已经接通：

- 校区管理员登录与会话保持
- 校区、班级、教师、学员、作业概览
- 教师账号创建
- 学生账号创建并绑定班级
- 统一调用 Supabase Edge Function 做安全建号

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

## GitHub Actions

仓库需要配置这两个 Secrets：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

工作流文件在 `.github/workflows/web-build.yml`，会在 `main` 分支推送、PR 和手动触发时构建。
