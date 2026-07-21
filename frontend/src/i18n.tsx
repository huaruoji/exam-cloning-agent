import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { safeGetItem, safeSetItem } from "./lib/api"

export type Language = "zh-CN" | "en"

const messages = {
  en: {
    overview: "Overview", materials: "Materials", questions: "Question Bank", practice: "Practice",
    exam: "Mock Exam", review: "Review", compute: "Compute", settings: "Settings", courses: "Courses",
    newCourse: "New course", courseName: "Course name", create: "Create", cancel: "Cancel", demo: "Demo",
    noCourses: "No courses yet. Create one or load the demo.", loading: "Loading...", language: "Language",
    computeTitle: "Compute Center", computeSubtitle: "See how tasks are routed across rules, caches, and model services.",
    refresh: "Refresh", runDrill: "Run failover drill", currentMode: "Current mode", systemStatus: "System status",
    successRate: "Success rate", cacheHit: "Cache hit", callsSaved: "Model calls saved", providers: "Model providers",
    recentRoutes: "Recent routes", noRoutes: "No routing events yet. Complete a practice or generation task first.",
    noProviders: "No model provider has been detected.", healthy: "Healthy", unavailable: "Unavailable",
    modelConnections: "Model connection", connectionHelp: "Connect any OpenAI-compatible model service. The key stays in this browser and is sent only with your requests.",
    label: "Display name", baseUrl: "Base URL", model: "Model", apiKey: "API key", allowFallback: "Allow built-in fallback",
    testConnection: "Test connection", save: "Save", useBuiltIn: "Use built-in", advanced: "Advanced",
    anonymousId: "Anonymous user ID", saved: "Connection saved", probeOk: "Connection is healthy", probeFailed: "Connection test failed",
    nextStep: "Recommended next step", startPractice: "Practice weakest topic", uploadMaterial: "Upload your first material",
    computeHealthy: "Routing available", computeDegraded: "Running in fallback mode", viewCompute: "View compute details",
    topicCoverage: "Topic coverage", showAll: "Show all", showLess: "Show less", selectCourse: "Select a course first.",
    generateExam: "Generate mock exam", examResults: "Mock Exam Results", savedExams: "Saved exams", noMatchingQuestions: "No questions match the current filters.",
    noWrongAnswers: "No wrong answers yet. Practice to populate this list.", noHistory: "No practice history yet.",
    resourceRouting: "Resource-aware routing", realRouting: "Observed routing decisions and latency",
    task: "Task", route: "Route", latency: "Latency", result: "Result", unknown: "Not probed",
    settingsSubtitle: "Configure model routing without exposing infrastructure details to learners.",
    endpointSafety: "User URLs are server-validated; private and loopback targets are reserved for administrator-managed providers.",
    idHelp: "Requests use this browser-local identifier. Changing it starts a separate workspace.", regenerate: "Regenerate",
    regenerateConfirm: "Generating a new user ID will not migrate existing data. Continue?", newId: "New anonymous ID generated",
    submit: "Submit", next: "Next", previous: "Previous", delete: "Delete", reviewExam: "Review",
    resume: "Resume", tryAgain: "Try again", back: "Back", edit: "Edit", generate: "Generate",
    docType: "Document type", docPastExam: "Past exam", docHomework: "Homework",
    docSlides: "Slides", docReferencePdf: "Reference PDF", allDocTypes: "All document types",
    allDifficulties: "All difficulties", diffEasy: "Easy", diffMedium: "Medium", diffHard: "Hard",
    correct: "Correct", wrong: "Wrong", accuracy: "Accuracy", feedback: "Feedback",
    explanation: "Explanation", answer: "Answer", expectedAnswer: "Expected answer",
    missingSteps: "Missing steps", watchOutFor: "Watch out for", suggestion: "Suggestion",
    needsReview: "Needs review", gradingUnavailable: "Grading unavailable",
    showAnswer: "Show answer", timeSpent: "Time spent",
    practiceAnother: 'Practice another "{{topic}}" question',
  },
  "zh-CN": {
    overview: "概览", materials: "学习材料", questions: "题库", practice: "自适应练习",
    exam: "模拟考试", review: "复习记录", compute: "算力中心", settings: "设置", courses: "课程",
    newCourse: "新建课程", courseName: "课程名称", create: "创建", cancel: "取消", demo: "载入演示",
    noCourses: "还没有课程。请新建课程或载入演示。", loading: "加载中…", language: "语言",
    computeTitle: "算力中心", computeSubtitle: "查看规则、缓存和模型服务如何协同完成任务。",
    refresh: "刷新", runDrill: "运行故障切换演练", currentMode: "当前模式", systemStatus: "系统状态",
    successRate: "请求成功率", cacheHit: "缓存命中率", callsSaved: "节省模型调用", providers: "模型节点",
    recentRoutes: "最近路由", noRoutes: "暂无路由事件，请先完成一次练习或生成任务。",
    noProviders: "尚未发现可用模型节点。", healthy: "健康", unavailable: "不可用",
    modelConnections: "模型连接", connectionHelp: "连接任意 OpenAI-compatible 模型服务。密钥仅保存在浏览器，并随你的请求发送。",
    label: "显示名称", baseUrl: "服务地址", model: "模型名称", apiKey: "API 密钥", allowFallback: "允许内置模型兜底",
    testConnection: "测试连接", save: "保存", useBuiltIn: "使用内置模型", advanced: "高级设置",
    anonymousId: "匿名用户 ID", saved: "模型连接已保存", probeOk: "连接正常", probeFailed: "连接测试失败",
    nextStep: "下一步建议", startPractice: "练习薄弱知识点", uploadMaterial: "上传第一份材料",
    computeHealthy: "路由服务正常", computeDegraded: "正在降级运行", viewCompute: "查看算力详情",
    topicCoverage: "知识点覆盖", showAll: "显示全部", showLess: "收起", selectCourse: "请先选择一门课程。",
    generateExam: "生成模拟试卷", examResults: "模拟考试结果", savedExams: "已保存试卷", noMatchingQuestions: "没有符合当前筛选条件的题目。",
    noWrongAnswers: "暂无错题，完成练习后会在这里汇总。", noHistory: "暂无练习记录。",
    resourceRouting: "资源感知路由", realRouting: "真实路由决策与实测延迟",
    task: "任务", route: "路径", latency: "延迟", result: "结果", unknown: "尚未探测",
    settingsSubtitle: "配置模型路由，同时避免向学习者暴露基础设施细节。",
    endpointSafety: "用户填写的地址会由服务端校验；内网和本机地址仅供管理员配置。",
    idHelp: "请求使用浏览器本地匿名标识。更换后会进入一个独立工作区。", regenerate: "重新生成",
    regenerateConfirm: "生成新用户 ID 不会迁移现有数据，是否继续？", newId: "已生成新的匿名 ID",
    submit: "提交", next: "下一题", previous: "上一题", delete: "删除", reviewExam: "查看",
    resume: "继续", tryAgain: "重试", back: "返回", edit: "编辑", generate: "生成",
    docType: "文档类型", docPastExam: "历年试卷", docHomework: "作业",
    docSlides: "课件", docReferencePdf: "参考 PDF", allDocTypes: "全部文档类型",
    allDifficulties: "全部难度", diffEasy: "简单", diffMedium: "中等", diffHard: "困难",
    correct: "正确", wrong: "错误", accuracy: "正确率", feedback: "反馈",
    explanation: "解析", answer: "答案", expectedAnswer: "参考答案",
    missingSteps: "缺失步骤", watchOutFor: "注意事项", suggestion: "建议",
    needsReview: "待复核", gradingUnavailable: "无法评分",
    showAnswer: "显示答案", timeSpent: "用时",
    practiceAnother: '再练一道"{{topic}}"题',
  },
} as const

export type MessageKey = keyof typeof messages.en

// Dev-only check: ensure both languages expose the same key set.
if (import.meta.env.DEV) {
  const enKeys = new Set(Object.keys(messages.en))
  const zhKeys = new Set(Object.keys(messages["zh-CN"]))
  const missingZh = [...enKeys].filter((k) => !zhKeys.has(k))
  const missingEn = [...zhKeys].filter((k) => !enKeys.has(k))
  if (missingZh.length || missingEn.length) {
    console.warn(
      "[i18n] key mismatch — missing in zh-CN:", missingZh,
      "| missing in en:", missingEn,
    )
  }
}

type TranslateFn = (key: MessageKey, params?: Record<string, string | number>) => string

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void; t: TranslateFn } | null>(null)

const LANG_STORAGE = "exam-cloner:language"

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = safeGetItem(LANG_STORAGE)
    if (saved === "zh-CN" || saved === "en") return saved
    return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
  })

  // Keep <html lang> in sync so screen readers and browser translation follow the UI language.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage: (next: Language) => { safeSetItem(LANG_STORAGE, next); setLanguageState(next) },
    t: ((key: MessageKey, params?: Record<string, string | number>) => {
      let msg: string = messages[language][key]
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          msg = msg.replace(`{{${k}}}`, String(v))
        }
      }
      return msg
    }) as TranslateFn,
  }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error("useLanguage must be used within LanguageProvider")
  return value
}