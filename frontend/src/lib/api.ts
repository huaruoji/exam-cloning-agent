const BASE_URL = "/api"

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
  upload: async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`${BASE_URL}/upload`, { method: "POST", body: formData })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  },

  getQuestions: (filters?: Record<string, string>) => {
    const params = filters ? "?" + new URLSearchParams(filters).toString() : ""
    return request<{ questions: any[]; total: number }>(`/questions${params}`)
  },

  getTopics: () => request<{ topics: string[] }>("/questions/topics/list"),

  getNextQuestion: () =>
    request<{ source: string; question: any }>("/practice/next", { method: "POST" }),

  submitAnswer: (questionId: string, answer: string, correct?: boolean) =>
    request<{ correct: boolean; concept: string; mastery_score: number; overall_accuracy: number }>(
      "/practice/answer",
      {
        method: "POST",
        body: JSON.stringify({ question_id: questionId, answer, correct }),
      }
    ),

  generateExam: (numQuestions?: number, timeLimit?: number) =>
    request<any>("/exam/generate", {
      method: "POST",
      body: JSON.stringify({ num_questions: numQuestions, time_limit_minutes: timeLimit }),
    }),

  getExamStyles: () => request<{ profiles: any[] }>("/exam/styles"),

  getStats: () =>
    request<{
      total_questions_in_bank: number
      total_attempted: number
      total_correct: number
      accuracy: number
      concept_mastery: Record<string, any>
      recent_accuracy: boolean[]
    }>("/stats"),

  health: () => request<{ status: string }>("/health"),
}
