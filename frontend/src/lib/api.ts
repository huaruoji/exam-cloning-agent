const BASE_URL = "/api"

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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
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
    const res = await fetch(`${BASE_URL}/uploads`, { method: "POST", body: formData })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  },

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

  getQuestions: (filters: Record<string, string>) => {
    const params = new URLSearchParams(filters).toString()
    return request<{ questions: any[]; total: number }>(`/questions?${params}`)
  },
  getTopics: (courseId: string) => request<{ topics: string[] }>(`/questions/topics/list?course_id=${courseId}`),

  getNextQuestion: (courseId: string) =>
    request<{ source: string; question: any }>("/practice/next", {
      method: "POST",
      body: JSON.stringify({ course_id: courseId }),
    }),
  submitAnswer: (payload: { courseId: string; questionId: string; answer: string; correct?: boolean }) =>
    request<{ correct: boolean; concept: string; feedback: string; explanation: string; correct_answer: string; mastery_score: number; overall_accuracy: number }>(
      "/practice/answer",
      {
        method: "POST",
        body: JSON.stringify({
          course_id: payload.courseId,
          question_id: payload.questionId,
          answer: payload.answer,
          correct: payload.correct,
        }),
      }
    ),

  generateExam: (payload: { courseId: string; numQuestions?: number; timeLimit?: number }) =>
    request<any>("/exam/generate", {
      method: "POST",
      body: JSON.stringify({
        course_id: payload.courseId,
        num_questions: payload.numQuestions,
        time_limit_minutes: payload.timeLimit,
      }),
    }),
  submitExam: (courseId: string, answers: { question_id: string; answer: string }[]) =>
    request<{ total: number; correct_count: number; accuracy: number; results: { question_id: string; correct: boolean; feedback: string; correct_answer: string; explanation: string }[] }>(
      "/exam/submit",
      {
        method: "POST",
        body: JSON.stringify({ course_id: courseId, answers }),
      }
    ),
  getExamStyle: (courseId: string) => request<{ profile: any }>(`/exam/styles?course_id=${courseId}`),

  getStats: (courseId: string) =>
    request<{
      total_questions_in_bank: number
      total_attempted: number
      total_correct: number
      accuracy: number
      concept_mastery: Record<string, any>
      recent_accuracy: boolean[]
      knowledge_topics: string[]
      document_counts: Record<string, number>
    }>(`/stats?course_id=${courseId}`),

  health: () => request<{ status: string }>("/health"),
}
