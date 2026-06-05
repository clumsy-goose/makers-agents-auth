const en = {
  // Header
  "app.title": "OpenAI Agents Starter",
  "app.subtitle": "Running on EdgeOne Makers with session memory & Agent Tools",

  // Empty state
  "empty.title": "OpenAI Agents Starter",
  "empty.hint": "I'm an OpenAI Agent running on EdgeOne with custom tools and session memory. I can help with weather, clothing advice, translation, and text statistics.",
  "empty.features": "EdgeOne Store · Session Memory · Agent Tools",

  // Chat input
  "chat.placeholder": "Type a message...  ⏎ Send · Shift+⏎ Newline",
  "chat.hint": "Powered by OpenAI Agents SDK · Demo only",

  // Preset questions
  "preset.1": "What is the weather like in Beijing now? Any clothing suggestions?",
  "preset.2": "Translate \"Hello, welcome to Beijing!\" into English and count the characters.",

  // Tool indicators
  "tool.weather": "Weather",
  "tool.clothing": "Clothing",
  "tool.translate": "Translate",
  "tool.statistics": "Statistics",

  // Status & errors
  "status.error": "Request failed. Please check if the backend service is running.",
  "status.stopped": "⏹ *Generation stopped*",
  "status.backendError": "Backend abort request failed. The server may still be running.",

  // Debug panel
  "debug.title": "Trace",
  "debug.events": "events",
  "debug.clear": "Clear",
  "debug.empty": "Waiting for SSE events...",
  "debug.emptyHint": "After sending a message, all raw backend data will be displayed here.",

  // Language toggle
  "lang.switch": "中文",

  // Auth screen — left panel
  "auth.brand": "OpenAI Agent · Edge",
  "auth.eyebrow": "Pages Agent · Auth Scheme A",
  "auth.headline.lead": "An edge",
  "auth.headline.accent": "identity",
  "auth.headline.tail": "gateway.",
  "auth.deck": "Middleware rejects at the edge, cloud-functions handle auth via Neon Postgres, and the Agent Runtime independently verifies the same JWT — two layers of defense, no reliance on upstream headers.",
  "auth.signal.edge": "Edge",
  "auth.signal.db": "Postgres",
  "auth.signal.hash": "Hash",
  "auth.signal.token": "Token",

  // Auth screen — tabs / forms
  "auth.tab.login": "Sign in",
  "auth.tab.register": "Sign up",
  "auth.login.title": "Welcome back",
  "auth.login.hint": "Sign in to continue your conversation.",
  "auth.login.submit": "Sign in",
  "auth.login.swap.q": "No account yet?",
  "auth.login.swap.cta": "Create one",
  "auth.register.title": "Create account",
  "auth.register.hint": "3-32 char username · 8-72 char password — instant access.",
  "auth.register.submit": "Register & sign in",
  "auth.register.swap.q": "Already registered?",
  "auth.register.swap.cta": "Sign in",
  "auth.field.username": "USERNAME",
  "auth.field.password": "PASSWORD",
  "auth.field.username.placeholder": "alice_42",
  "auth.field.password.helper": "Min 8 chars · stored as bcrypt cost 10",
  "auth.password.show": "Show password",
  "auth.password.hide": "Hide password",
  "auth.submit.busy": "Working…",

  // Auth — errors
  "auth.error.empty": "Username and password are required",
  "auth.err.invalid_credentials": "Invalid username or password",
  "auth.err.username_taken": "Username is already taken",
  "auth.err.invalid_username": "Invalid username (3-32 chars, [A-Za-z0-9_-] only)",
  "auth.err.invalid_password": "Password must be 8 to 72 characters",
  "auth.err.bad_request": "Bad request",
  "auth.err.db_error": "Database unavailable, please retry",
  "auth.err.server_misconfigured": "Server misconfigured: JWT_SECRET missing",
  "auth.err.auth_required": "Session expired, please sign in again",
  "auth.err.unknown": "Unknown error",

  // Welcome flash
  "welcome.title.login": "Welcome back",
  "welcome.title.register": "Account created",
  "welcome.subtitle": "Auth chain active · two-layer defense engaged",
  "welcome.chain.browser": "Browser",
  "welcome.chain.browser.note": "Cookie eo_token",
  "welcome.chain.middleware": "Middleware",
  "welcome.chain.middleware.note": "Web Crypto reject",
  "welcome.chain.cf": "Cloud Function",
  "welcome.chain.cf.note": "bcrypt + sign JWT",
  "welcome.chain.agent": "Agent Runtime",
  "welcome.chain.agent.note": "node:crypto verify",
  "welcome.dismiss": "Dismiss",

  // User pill
  "pill.expand": "Open account menu",
  "pill.collapse": "Close account menu",
  "pill.you": "Signed in",
  "pill.userId": "User ID",
  "pill.token": "JWT",
  "pill.token.value": "HS256 · HttpOnly Cookie",
  "pill.expiresAt": "Expires at",
  "pill.signout": "Sign out",

  // Auth Chain Trace
  "trace.title": "Auth chain trace",
  "trace.idle": "Idle · send a message to activate",
  "trace.streaming": "Agent streaming…",
  "trace.complete": "Chain complete",
  "trace.error": "Chain broken",
  "trace.node.browser": "Browser",
  "trace.node.browser.note": "Cookie attached",
  "trace.node.middleware": "Middleware",
  "trace.node.middleware.note": "early-reject",
  "trace.node.agent": "Agent Runtime",
  "trace.node.agent.note": "auth_ok confirmed",
  "trace.node.neon": "Neon",
  "trace.node.neon.note": "HTTPS · users",
  "trace.node.response": "Response",
  "trace.node.response.note": "first token",
} as const;

export default en;
