import { useCallback, useEffect, useState } from "react"
import { Check, Pencil, Sparkles, X } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { QuestionCard } from "@/components/QuestionCard"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n"

const PAGE_SIZE = 20

export function QuestionBank() {
  const { t } = useLanguage()
  const { selectedCourse } = useLayoutContext()
  const { addToast } = useToast()
  const [questions, setQuestions] = useState<any[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [topic, setTopic] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [page, setPage] = useState(0)
  const [reclustering, setReclustering] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  const loadTopics = useCallback(() => {
    if (!selectedCourse) return
    api.getTopics(selectedCourse.id).then((res) => setTopics(res.topics)).catch(() => setTopics([]))
  }, [selectedCourse])

  useEffect(() => { loadTopics() }, [loadTopics])

  const loadQuestions = useCallback(() => {
    if (!selectedCourse) { setQuestions([]); return }
    api.getQuestions({
      course_id: selectedCourse.id,
      ...(topic ? { topic } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(sourceType ? { source_type: sourceType } : {}),
    }).then((res) => { setQuestions(res.questions); setPage(0) })
      .catch((e) => { setQuestions([]); addToast(e.message || "Failed to load questions", "error") })
  }, [selectedCourse, topic, difficulty, sourceType, addToast])

  useEffect(() => {
    let cancelled = false
    if (!selectedCourse) { setQuestions([]); return }
    api.getQuestions({
      course_id: selectedCourse.id,
      ...(topic ? { topic } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(sourceType ? { source_type: sourceType } : {}),
    }).then((res) => { if (!cancelled) { setQuestions(res.questions); setPage(0) } })
      .catch((e) => { if (!cancelled) { setQuestions([]); addToast(e.message || "Failed to load questions", "error") } })
    return () => { cancelled = true }
  }, [selectedCourse, topic, difficulty, sourceType, addToast])

  const handleDelete = async (questionId: string) => {
    if (!confirm("Remove this question from the bank?")) return
    try {
      await api.deleteQuestion(questionId)
      setQuestions((prev) => prev.filter((q) => q.id !== questionId))
      addToast("Question removed", "success")
    } catch (e: any) {
      addToast(e.message || "Failed to delete", "error")
    }
  }

  const handleTopicChange = async (questionId: string, newTopic: string) => {
    try {
      await api.updateQuestionTopic(questionId, newTopic)
      setQuestions((prev) => prev.map((q) => q.id === questionId ? { ...q, topic: newTopic } : q))
      addToast("Topic updated", "success")
    } catch (e: any) {
      addToast(e.message || "Failed to update topic", "error")
    }
  }

  const handleRecluster = async () => {
    if (!selectedCourse) return
    if (!confirm("Use AI to merge similar topics into a clean taxonomy?")) return
    setReclustering(true)
    try {
      const res = await api.reclusterTopics(selectedCourse.id)
      if (res.error) addToast(res.error, "error")
      else {
        addToast(`Reclustered: ${res.old_topic_count} → ${res.new_topic_count} topics (${res.updated_questions} updated)`, "success")
        setTopics(res.topics)
        const qres = await api.getQuestions({ course_id: selectedCourse.id })
        setQuestions(qres.questions)
      }
    } catch (e: any) {
      addToast(e.message || "Reclustering failed", "error")
    } finally {
      setReclustering(false)
    }
  }

  const startEdit = (q: any) => {
    setEditingId(q.id)
    setEditForm({
      content: q.content || "",
      answer: q.answer || "",
      options: q.options?.join("\n") || "",
      explanation: q.explanation || "",
      difficulty: q.difficulty || "medium",
      topic: q.topic || "",
      question_type: q.question_type || "mcq",
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async (questionId: string) => {
    const payload: any = {}
    for (const [key, value] of Object.entries(editForm)) {
      if (key === "options") {
        payload.options = (value as string).split("\n").map((s: string) => s.trim()).filter(Boolean)
      } else {
        payload[key] = value
      }
    }
    try {
      await api.updateQuestion(questionId, payload)
      await loadQuestions()
      addToast("Question updated", "success")
      cancelEdit()
    } catch (e: any) {
      addToast(e.message || "Failed to update question", "error")
    }
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("questions")}</h1>
        <p className="mt-2 text-sm text-slate-muted">{t("selectCourse")}</p>
      </div>
    )
  }

  const totalPages = Math.ceil(questions.length / PAGE_SIZE)
  const paged = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{t("questions")}</h1>
          <p className="mt-2 text-sm text-slate-muted">Inspect parsed questions. Remove bad parses, edit topics, or re-cluster with AI.</p>
        </div>
        <button
          onClick={handleRecluster}
          disabled={reclustering || topics.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-ivory px-3 py-2 text-sm hover:bg-ivory-warm disabled:opacity-50"
        >
          <Sparkles size={15} className="text-coral" />
          {reclustering ? "Reclustering..." : "Re-cluster topics"}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">All topics ({topics.length})</option>
          {topics.map((item) => (<option key={item} value={item}>{item}</option>))}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">{t("allDifficulties")}</option>
          <option value="easy">{t("diffEasy")}</option>
          <option value="medium">{t("diffMedium")}</option>
          <option value="hard">{t("diffHard")}</option>
        </select>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">{t("allDocTypes")}</option>
          <option value="past_exam">{t("docPastExam")}</option>
          <option value="homework">{t("docHomework")}</option>
          <option value="slides">{t("docSlides")}</option>
          <option value="reference_pdf">{t("docReferencePdf")}</option>
        </select>
      </div>

      <p className="mt-4 text-xs text-slate-muted">{questions.length} questions · page {page + 1} of {totalPages || 1}</p>

      <div className="mt-3 space-y-3">
        {paged.length === 0 ? (
          <Card><CardContent className="py-12 text-sm text-slate-muted">{t("noMatchingQuestions")}</CardContent></Card>
        ) : (
          paged.map((q) => (
            <div key={q.id}>
              {editingId === q.id ? (
                /* Inline edit form */
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{t("edit")}</p>
                      <div className="flex gap-2">
                        <Button variant="coral" size="sm" onClick={() => saveEdit(q.id)}>
                          <Check size={14} /> Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          <X size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Content</label>
                      <textarea
                        value={editForm.content}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        className="min-h-[80px] w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                      />
                      {editForm.content && (
                        <div className="mt-1 rounded-lg bg-ivory-deep px-3 py-2 text-sm">
                          <MathRenderer content={editForm.content} />
                        </div>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Answer</label>
                        <textarea
                          value={editForm.answer}
                          onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                          className="min-h-[60px] w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Options (one per line)</label>
                        <textarea
                          value={editForm.options}
                          onChange={(e) => setEditForm({ ...editForm, options: e.target.value })}
                          className="min-h-[60px] w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                          placeholder="Option A&#10;Option B&#10;Option C"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Explanation</label>
                      <textarea
                        value={editForm.explanation}
                        onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                        className="min-h-[60px] w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Difficulty</label>
                          <select
                            value={editForm.difficulty}
                            onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                            className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                          >
                            <option value="easy">{t("diffEasy")}</option>
                            <option value="medium">{t("diffMedium")}</option>
                            <option value="hard">{t("diffHard")}</option>
                          </select>
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Topic</label>
                        <input
                          value={editForm.topic}
                          onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                          className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Question type</label>
                        <select
                          value={editForm.question_type}
                          onChange={(e) => setEditForm({ ...editForm, question_type: e.target.value })}
                          className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                        >
                          <option value="mcq">MCQ</option>
                          <option value="short_answer">Short answer</option>
                          <option value="calculation">Calculation</option>
                          <option value="essay">Essay</option>
                          <option value="true_false">True/False</option>
                        </select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="relative">
                  <QuestionCard
                    question={q}
                    topicEditable
                    deletable
                    onDelete={handleDelete}
                    onTopicChange={handleTopicChange}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(q) }}
                    className="absolute right-11 top-4 rounded-lg p-1.5 text-slate-muted hover:bg-coral/10 hover:text-coral"
                    title={t("edit")}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="rounded-lg border border-border bg-ivory px-3 py-1.5 text-sm disabled:opacity-50">{t("previous")}</button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)}
              className={cn("h-8 w-8 rounded-lg text-sm", page === i ? "border border-coral/40 bg-coral/10 text-coral" : "bg-ivory text-slate-muted hover:bg-ivory-warm")}>{i + 1}</button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="rounded-lg border border-border bg-ivory px-3 py-1.5 text-sm disabled:opacity-50">{t("next")}</button>
        </div>
      )}
    </div>
  )
}
