# WORKFLOW

这个文件记录本仓库推荐的 Git/Fork 开发流程，目标是：

- 避免在 `main` 上直接开发
- 保持 fork 与上游同步
- 在引入上游更新时降低冲突和回归风险

## Remote 约定

- `origin`: 你的 fork，用于日常 `push`
- `upstream`: 上游仓库，用于同步更新

查看当前配置：

```bash
git remote -v
```

建议禁用对 `upstream` 的推送：

```bash
git remote set-url --push upstream DISABLED
```

## 分支约定

- `main`: 只作为本地同步分支，不直接开发
- `upstream-main`: 跟踪 `upstream/main` 的干净基线
- `feat/*`: 新功能开发分支
- `fix/*`: 缺陷修复分支
- `integration/*`: 合并上游或多分支后的验证分支
- `backup-*`: 只做备份，不继续日常开发

## 一次性初始化

如果本地还没有干净基线分支：

```bash
git fetch --all --prune
git switch -c upstream-main --track upstream/main
```

以后所有新功能都从 `upstream-main` 起分支，不要从本地 `main` 起。

## 日常新功能流程

### 1. 同步上游基线

```bash
git fetch upstream
git switch upstream-main
git merge --ff-only upstream/main
```

### 2. 基于干净基线创建开发分支

```bash
git switch -c feat/your-feature
```

### 3. 开发并提交

```bash
git add .
git commit -m "feat(scope): ..."
```

### 4. 推送到自己的 fork

```bash
git push -u origin feat/your-feature
```

## 开发中同步上游

如果功能开发期间上游有更新：

### 1. 更新基线

```bash
git fetch upstream
git switch upstream-main
git merge --ff-only upstream/main
```

### 2. 让功能分支跟上基线

```bash
git switch feat/your-feature
git rebase upstream-main
```

如果出现冲突：

```bash
git status
# 手动解决冲突
git add <resolved-files>
git rebase --continue
```

如果想放弃这次 rebase：

```bash
git rebase --abort
```

rebase 完成后需要更新远端分支：

```bash
git push --force-with-lease
```

## 集成验证流程

当你需要验证：

- 你的功能分支 + 上游最新 `main`
- 多个分支之间是否兼容
- 合并后是否还能通过测试

不要直接在 `main` 上操作，使用 `integration/*` 分支。

### 1. 从干净基线创建集成分支

```bash
git fetch --all --prune
git switch upstream-main
git merge --ff-only upstream/main
git switch -c integration/your-feature
```

### 2. 合入要验证的分支

```bash
git merge origin/feat/your-feature
```

如果还要合其他分支，继续 `git merge ...`。

### 3. 跑验证

示例：

```bash
cd frontend
BASE_URL=http://localhost:3000 CI=1 npm run test:e2e
```

### 4. 验证通过后处理

如果集成分支只是验证用途，可以保留它做 PR 或参考，不必强行合回本地 `main`。

## 当前仓库的特别建议

基于当前仓库状态，建议遵守以下规则：

- 不要在本地 `main` 上继续开发
- 新任务统一从 `upstream-main` 创建 `feat/*` 或 `fix/*`
- 合并验证统一走 `integration/*`
- 上游更新只先进 `upstream-main`

## 推荐命令清单

### 开始一个新任务

```bash
git fetch --all --prune
git switch upstream-main
git merge --ff-only upstream/main
git switch -c feat/next-task
```

### 把当前功能分支同步到最新上游

```bash
git fetch upstream
git switch upstream-main
git merge --ff-only upstream/main
git switch feat/next-task
git rebase upstream-main
```

### 做一次集成验证

```bash
git fetch --all --prune
git switch upstream-main
git merge --ff-only upstream/main
git switch -c integration/next-task
git merge origin/feat/next-task
```

### 推送当前分支

```bash
git push -u origin HEAD
```

## 不推荐的做法

- 在 `main` 上直接开发
- 把上游更新直接 merge 到正在开发的脏分支且不做验证
- 对 `upstream` 直接 push
- 遇到分叉后直接 `git pull` 硬拉，不先看基线和跟踪关系
- 用 `git reset --hard` 处理不清楚来源的冲突

## 如果要清理本地 `main`

本仓库的本地 `main` 可能已经不是干净主线。清理它时建议单独操作：

1. 先创建备份分支
2. 确认要对齐的是 `upstream/main` 还是 `origin/main`
3. 再重置 `main`

示例：

```bash
git switch main
git switch -c backup-main-before-reset
git switch main
git fetch upstream
git reset --hard upstream/main
```

只有在你确认本地 `main` 不再承载未提交工作时，才执行这类操作。
