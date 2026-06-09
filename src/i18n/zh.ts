const zh = {
  // Header
  "app.title": "Agent 登录鉴权模板",
  "app.subtitle": "EdgeOne Makers · 边缘中间件 + Cloud Functions + Agent 双层鉴权",

  // Empty state
  "empty.title": "Agent 登录鉴权模板",
  "empty.hint": "登录后即可对话。本 Demo 演示如何用 EdgeOne Makers 的中间件 + Cloud Functions 给 Agent 接口加上 JWT 鉴权,Agent 内置三个鉴权知识工具(中间件、流程、JWT),回答均基于真实文档片段。",
  "empty.features": "EdgeOne Store · 会话记忆 · Agent 工具",

  // Chat input
  "chat.placeholder": "输入消息...  ⏎ 发送 · Shift+⏎ 换行",
  "chat.hint": "由 OpenAI Agents SDK 驱动 · 仅供演示",

  // Preset questions
  "preset.1": "EdgeOne Makers 中间件如何使用？",
  "preset.2": "登录鉴权的流程是怎么样的？",
  "preset.3": "鉴权的原理是什么？",
  "preset.4": "EdgeOne Makers Agents 的鉴权示例",

  // Tool indicators
  "tool.middleware": "中间件",
  "tool.flow": "流程",
  "tool.jwt": "JWT",

  // Status & errors
  "status.error": "请求失败，请检查后端服务是否正常运行。",
  "status.stopped": "⏹ *已停止生成*",
  "status.backendError": "后端中止请求失败，服务器可能仍在运行。",

  // Debug panel
  "debug.title": "传输流",
  "debug.events": "事件",
  "debug.clear": "清除",
  "debug.empty": "等待 SSE 事件...",
  "debug.emptyHint": "发送消息后，所有原始后端数据将在此处显示。",

  // Language toggle
  "lang.switch": "English",

  // Auth screen — left panel
  "auth.brand": "OpenAI Agent · Edge",
  "auth.eyebrow": "Pages Agent · 鉴权方案一",
  "auth.headline.lead": "一道边缘",
  "auth.headline.accent": "身份",
  "auth.headline.tail": "之门",
  "auth.deck": "EdgeOne 中间件在节点早拒,cloud-functions 走 Neon Postgres 完成登录注册,Agent Runtime 用同一个密钥独立验签 — 双层防御铁律,不依赖任何上游 header。",
  "auth.signal.edge": "边缘节点",
  "auth.signal.db": "Postgres",
  "auth.signal.hash": "哈希",
  "auth.signal.token": "令牌",

  // Auth screen — tabs / forms
  "auth.tab.login": "登录",
  "auth.tab.register": "注册",
  "auth.login.title": "欢迎回来",
  "auth.login.hint": "输入账号继续上次对话。",
  "auth.login.submit": "登录",
  "auth.login.swap.q": "还没账号?",
  "auth.login.swap.cta": "立即注册",
  "auth.register.title": "创建账号",
  "auth.register.hint": "3-10 位用户名 · 8-16 位密码,注册即用。",
  "auth.register.submit": "注册并登录",
  "auth.register.swap.q": "已有账号?",
  "auth.register.swap.cta": "去登录",
  "auth.field.username": "USERNAME",
  "auth.field.password": "PASSWORD",
  "auth.field.username.placeholder": "alice_42",
  "auth.field.password.helper": "至少 8 位 · bcrypt 10 轮哈希存储",
  "auth.password.show": "显示密码",
  "auth.password.hide": "隐藏密码",
  "auth.submit.busy": "处理中…",

  // Auth — errors
  "auth.error.empty": "请填写用户名和密码",
  "auth.err.invalid_credentials": "用户名或密码不正确",
  "auth.err.username_taken": "该用户名已被注册",
  "auth.err.invalid_username": "用户名格式不合法(3-10 位,允许字母/数字/下划线/连字符)",
  "auth.err.invalid_password": "密码长度需在 8-16 之间",
  "auth.err.bad_request": "请求格式错误",
  "auth.err.db_error": "数据库暂不可达,请稍后重试",
  "auth.err.server_misconfigured": "服务端未配置 JWT_SECRET",
  "auth.err.auth_required": "会话已失效,请重新登录",
  "auth.err.unknown": "未知错误",

  // Guest 模式(未登录头部 CTA + 弹窗关闭)
  "guest.signin": "登录",
  "auth.modal.dismiss": "关闭",
  "auth.modal.required": "登录后继续",

  // User pill
  "pill.expand": "展开账户菜单",
  "pill.collapse": "收起账户菜单",
  "pill.you": "已登录",
  "pill.userId": "用户 ID",
  "pill.token": "JWT",
  "pill.token.value": "HS256 · HttpOnly Cookie",
  "pill.expiresAt": "过期时间",
  "pill.signout": "退出登录",

  // Auth Chain Trace(每条消息发送时实时点亮)
  "trace.title": "鉴权链路追踪",
  "trace.idle": "空闲 · 发送消息以激活链路",
  "trace.streaming": "Agent 流式输出中",
  "trace.complete": "链路完成",
  "trace.error": "链路中断",
  "trace.node.browser": "浏览器",
  "trace.node.browser.note": "Cookie 携带",
  "trace.node.middleware": "Middleware",
  "trace.node.middleware.note": "早拒",
  "trace.node.agent": "Agent Runtime",
  "trace.node.agent.note": "auth_ok 已确认",
  "trace.node.neon": "Neon",
  "trace.node.neon.note": "HTTPS · users 表",
  "trace.node.response": "响应流",
  "trace.node.response.note": "首字 token",
} as const;

export default zh;
