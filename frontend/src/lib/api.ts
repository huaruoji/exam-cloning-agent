const BASE_URL = `${import.meta.env.BASE_URL}api`

const API_KEY_STORAGE = "exam-cloner:user-api-key"
const USER_ID_STORAGE = "exam-cloner:user-id"
const MODEL_CONFIG_STORAGE = "exam-cloner:model-config"

export function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}
export function safeRemoveItem(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export interface ModelConfig {
  label: string
  baseUrl: string
  model: string
  apiKey: string
  allowFallback: boolean
}

export const defaultModelConfig: ModelConfig = { label: "Custom model", baseUrl: "", model: "", apiKey: "", allowFallback: true }

export function getModelConfig(): ModelConfig {
  try { return { ...defaultModelConfig, ...JSON.parse(safeGetItem(MODEL_CONFIG_STORAGE) || "{}") } }
  catch { return defaultModelConfig }
}

export function setModelConfig(config: ModelConfig) {
  safeSetItem(MODEL_CONFIG_STORAGE, JSON.stringify(config))
  setUserApiKey(config.apiKey)
}

function getUserId(): string {
  let uid = safeGetItem(USER_ID_STORAGE)
  if (!uid) {
    uid = crypto.randomUUID()
    safeSetItem(USER_ID_STORAGE, uid)
  }
  return uid
}

export function getUserIdDisplay(): string {
  return getUserId()
}

export function regenerateUserId(): string {
  const uid = crypto.randomUUID()
  safeSetItem(USER_ID_STORAGE, uid)
  return uid
}

export function getUserApiKey(): string {
  return safeGetItem(API_KEY_STORAGE) || ""
}

export function setUserApiKey(key: string) {
  if (key) safeSetItem(API_KEY_STORAGE, key)
  else safeRemoveItem(API_KEY_STORAGE)
}

export interface Course {
  id: string
  name: string
  auto_detected_name?: string | null
}

export interface DocumentRecord {
  id: string
  course_id: string
  title: string
  original_filename: string
  document_type: string
  status: string
  detected_course_name?: string | null
  page_count: number
  created_at: string
}

export interface JobRecord {
  id: string
  course_id: string
  document_id: string
  status: string
  stage: string
  progress: number
  message: string
  error?: string | null
  created_at: string
}

export interface Question {
  id: string
  course_id?: string
  source_document_id?: string
  source_type?: string
  content: string
  question_type: string
  difficulty: string
  topic: string
  options?: string[] | null
  answer: string
  explanation: string
  source_pdf?: string | null
  source_page?: number | null
}

function identityHeaders(): Record<string, string> {
  return { "X-User-Id": getUserId() }
}

function modelHeaders(): Record<string, string> {
  const config = getModelConfig()
  const key = config.apiKey || getUserApiKey()
  const headers = identityHeaders()
  if (key) headers["X-User-Api-Key"] = key
  if (config.baseUrl) headers["X-Model-Base-Url"] = config.baseUrl
  if (config.model) headers["X-Model-Name"] = config.model
  headers["X-Allow-Fallback"] = String(config.allowFallback)
  return headers
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers: optionHeaders, ...rest } = options || {}
  const res = await fetch(`${BASE_URL}${url}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...identityHeaders(), ...optionHeaders },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || "Request failed")
  }
  return res.json()
}

async function modelRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers: optionHeaders, ...rest } = options || {}
  const res = await fetch(`${BASE_URL}${url}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...modelHeaders(), ...optionHeaders },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || "Request failed")
  }
  return res.json()
}

export const api = {
  listCourses: () => request<{ courses: Course[] }>("/courses"),
  createCourse: (name: string) =>
    request<Course>("/courses", { method: "POST", body: JSON.stringify({ name }) }),
  updateCourse: (courseId: string, name: string) =>
    request<Course>(`/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  upload: async (payload: {
    file: File
    courseId?: string
    courseName?: string
    documentType: string
  }) => {
    const formData = new FormData()
    formData.append("file", payload.file)
    formData.append("document_type", payload.documentType)
    if (payload.courseId) formData.append("course_id", payload.courseId)
    if (payload.courseName) formData.append("course_name", payload.courseName)
    const res = await fetch(`${BASE_URL}/uploads`, {
      method: "POST",
      body: formData,
      headers: identityHeaders(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }))
      throw new Error(err.detail || "Upload failed")
    }
    return res.json()
  },

  uploadText: (payload: {
    courseId?: string
    courseName?: string
    documentType: string
    title: string
    text: string
  }) =>
    request<{ course: any; document: any; job: any }>("/uploads/text", {
      method: "POST",
      body: JSON.stringify({
        course_id: payload.courseId,
        course_name: payload.courseName,
        document_type: payload.documentType,
        title: payload.title,
        text: payload.text,
      }),
    }),

  listDocuments: (courseId: string) =>
    request<{ documents: DocumentRecord[] }>(`/documents?course_id=${courseId}`),
  updateDocument: (documentId: string, payload: { title?: string; document_type?: string }) =>
    request<DocumentRecord>(`/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listJobs: (courseId?: string) =>
    request<{ jobs: JobRecord[] }>(courseId ? `/jobs?course_id=${courseId}` : "/jobs"),
  getJob: (jobId: string) => request<JobRecord>(`/jobs/${jobId}`),
  retryJob: (jobId: string) =>
    request<{ job: JobRecord }>(`/jobs/${jobId}/retry`, { method: "POST" }),

  getQuestions: (filters: Record<string, string>) => {
    const params = new URLSearchParams(filters).toString()
    return request<{ questions: Question[]; total: number }>(`/questions?${params}`)
  },
  getTopics: (courseId: string) =>
    request<{ topics: string[] }>(`/questions/topics/list?course_id=${courseId}`),
  deleteQuestion: (questionId: string) =>
    request<{ deleted: string }>(`/questions/${questionId}`, { method: "DELETE" }),
  updateQuestion: (questionId: string, payload: {
    content?: string
    answer?: string
    options?: string[]
    explanation?: string
    difficulty?: string
    topic?: string
    question_type?: string
  }) =>
    request<Question>(`/questions/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getNextQuestion: (courseId: string, allowAi: boolean = true, topic?: string) =>
    modelRequest<{ source: string | null; question: Question | null }>("/practice/next", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, allow_ai: allowAi, ...(topic ? { topic } : {}) }),
    }),
  submitAnswer: (payload: {
    courseId: string
    questionId: string
    answer: string
    correct?: boolean
    action?: "submit" | "reveal" | "report" | "next"
  }) =>
    modelRequest<{
      correct: boolean | null
      concept: string
      feedback: string
      explanation: string
      correct_answer: string
      mastery_score: number
      overall_accuracy: number
      missing_steps: string[]
      wrong_concepts: string[]
      suggestion: string
    }>("/practice/answer", {
      method: "POST",
      body: JSON.stringify({
        course_id: payload.courseId,
        question_id: payload.questionId,
        answer: payload.answer,
        correct: payload.correct,
        action: payload.action || "submit",
      }),
    }),

  generateExam: async (payload: {
    courseId: string
    numQuestions?: number
    typeDistribution?: Record<string, number> | null
    difficultyDistribution?: Record<string, number> | null
    topics?: string[] | null
    extraPrompt?: string
    timeLimitMinutes?: number
    bankRatio?: number
    onProgress?: (done: number, total: number) => void
  }, signal?: AbortSignal): Promise<{ id: string; title: string; questions: Question[]; style_profile: any; time_limit_minutes: number | null }> => {
    const res = await fetch(`${BASE_URL}/exam/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...modelHeaders() },
      signal,
      body: JSON.stringify({
        course_id: payload.courseId,
        num_questions: payload.numQuestions,
        type_distribution: payload.typeDistribution,
        difficulty_distribution: payload.difficultyDistribution,
        topics: payload.topics,
        extra_prompt: payload.extraPrompt || "",
        time_limit_minutes: payload.timeLimitMinutes,
        bank_ratio: payload.bankRatio != null ? payload.bankRatio / 100 : undefined,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Generation failed" }))
      throw new Error(err.detail || "Generation failed")
    }
    // Read NDJSON stream for progress.
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let exam: any = null
    let aborted = false
    while (true) {
      if (signal?.aborted) { aborted = true; break }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line)
          if (evt.type === "progress" && payload.onProgress) {
            payload.onProgress(evt.done, evt.total)
          } else if (evt.type === "complete") {
            exam = evt.exam
          }
        } catch { /* ignore parse errors on partial lines */ }
      }
    }
    reader.cancel()
    if (aborted) throw new DOMException("Aborted", "AbortError")
    if (!exam) throw new Error("Generation produced no result")
    return exam
  },
  listExams: (courseId: string) =>
    request<{ exams: any[] }>(`/exam?course_id=${courseId}`),
  getExam: (examId: string) => request<any>(`/exam/${examId}`),
  deleteExam: (examId: string) =>
    request<{ deleted: string }>(`/exam/${examId}`, { method: "DELETE" }),
  submitExam: (courseId: string, examId: string, answers: { question_id: string; answer: string }[], elapsedSeconds?: number) =>
    modelRequest<{
      total: number
      correct_count: number
      accuracy: number
      results: { question_id: string; correct: boolean; feedback: string; correct_answer: string; explanation: string; missing_steps: string[]; wrong_concepts: string[]; suggestion: string }[]
    }>("/exam/submit", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId, exam_id: examId, answers, elapsed_seconds: elapsedSeconds || 0 }),
    }),
  saveExamAnswers: (examId: string, answers: Record<string, string>, elapsedSeconds: number) =>
    request<{ status: string }>(`/exam/${examId}/answers`, {
      method: "PATCH",
      body: JSON.stringify({ answers, elapsed_seconds: elapsedSeconds }),
    }),

  exportWrongs: (examId: string) =>
    request<{ imported: number }>(`/exam/${examId}/export-wrongs`, { method: "POST" }),

  getExamStyle: (courseId: string) => request<{ profile: any }>(`/exam/styles?course_id=${courseId}`),

  // Topics
  reclusterTopics: (courseId: string) =>
    request<{ status: string; updated_questions: number; old_topic_count: number; new_topic_count: number; topics: string[]; error?: string }>(
      `/topics/${courseId}/recluster`, { method: "POST" }
    ),
  updateQuestionTopic: (questionId: string, topic: string) =>
    request<{ question_id: string; topic: string }>(`/topics/question/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify({ topic }),
    }),

  getStats: (courseId: string) =>
    request<{
      total_questions_in_bank: number
      total_attempted: number
      total_correct: number
      accuracy: number
      concept_mastery: Record<string, { score: number }>
      recent_accuracy: boolean[]
      knowledge_topics: string[]
      document_counts: Record<string, number>
    }>(`/stats?course_id=${courseId}`),

  // Review / history
  getWrong: (courseId: string) =>
    request<{ wrong: any[]; total: number }>(`/review/wrong?course_id=${courseId}`),
  getHistory: (courseId: string) =>
    request<{ history: any[]; total: number }>(`/review/history?course_id=${courseId}`),
  getReviewStats: (courseId: string) =>
    request<{
      total_submitted: number
      total_correct: number
      daily: { date: string; accuracy: number; count: number }[]
      topic_stats: { topic: string; accuracy: number; count: number }[]
    }>(`/review/stats?course_id=${courseId}`),

  // Demo
  seedDemo: () => request<{ status: string; course: Course | null; questions_loaded?: number; message?: string }>("/demo/seed", { method: "POST" }),

  getComputeStatus: () => request<any>("/compute/status"),
  probeCompute: (payload: { base_url: string; api_key?: string; model?: string }) =>
    request<any>("/compute/probe", { method: "POST", body: JSON.stringify(payload) }),
  runFailoverDrill: () => request<any>("/compute/failover-drill", { method: "POST" }),

  health: () => request<{ status: string }>("/health"),
}
