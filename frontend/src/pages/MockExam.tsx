import { useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Clock, Loader2, Minus, Plus, RotateCcw, Save, Settings2, XCircle } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n"

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  multiple_choice: "MCQ",
  short_answer: "Short Ans",
  calculation: "Calculation",
  essay: "Essay",
  "true_false": "True/False",
}

const DIFF_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
}

function label(key: string, map: Record<string, string>): string {
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
}

interface ExamConfig {
  numQuestions: number
  typeDistribution: Record<string, number> | null
  difficultyDistribution: Record<string, number> | null
  extraPrompt: string
  timeLimitMinutes: number
  bankRatio: number
}

function normalizeDist(values: Record<string, number>): Record<string, number> {
  const entries = Object.entries(values)
  const sum = entries.reduce((s, [, v]) => s + v, 0)
  if (sum === 0) return values

  const result: Record<string, number> = {}
  let total = 0
  const sorted = [...entries].sort((a, b) => b[1] - a[1])

  for (const [k, v] of sorted) {
    const pct = Math.round((v / sum) * 100)
    result[k] = pct
    total += pct
  }

  const diff = 100 - total
  if (diff !== 0 && sorted.length > 0) {
    result[sorted[0][0]] = Math.max(0, result[sorted[0][0]] + diff)
  }

  return result
}

function toPct(dist: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(dist)) result[key] = Math.round(value * 100)
  return normalizeDist(result)
}

export function MockExam() {
  const { t } = useLanguage()
  const { selectedCourse } = useLayoutContext()
  const { addToast } = useToast()
  const [exam, setExam] = useState<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [examResults, setExamResults] = useState<any>(null)
  const [savedExams, setSavedExams] = useState<any[]>([])
  const [config, setConfig] = useState<ExamConfig>({
    numQuestions: 10,
    typeDistribution: null,
    difficultyDistribution: null,
    extraPrompt: "",
    timeLimitMinutes: 0,
    bankRatio: 80,
  })
  const [elapsed, setElapsed] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [lastSavedKey, setLastSavedKey] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [typePct, setTypePct] = useState<Record<string, number>>({})
  const [diffPct, setDiffPct] = useState<Record<string, number>>({})
  const [initialTypePct, setInitialTypePct] = useState<Record<string, number>>({})
  const [initialDiffPct, setInitialDiffPct] = useState<Record<string, number>>({})
  const [importedWrongs, setImportedWrongs] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref-based save callback to avoid stale closures in intervals
  const doSaveRef = useRef<() => Promise<void>>(async () => {})

  // Latest state via refs for the save callback
  const examRef = useRef<any>(null)
  const startedAtRef = useRef<number | null>(null)
  const answersRef = useRef<Record<number, string>>({})
  const lastSavedKeyRef = useRef("")
  const submittedRef = useRef(false)

  useEffect(() => { examRef.current = exam }, [exam])
  useEffect(() => { startedAtRef.current = startedAt }, [startedAt])
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { lastSavedKeyRef.current = lastSavedKey }, [lastSavedKey])
  useEffect(() => { submittedRef.current = submitted }, [submitted])

  // Keep doSaveRef up to date with latest state
  useEffect(() => {
    doSaveRef.current = async () => {
      const e = examRef.current
      const sa = startedAtRef.current
      if (!e || sa === null || submittedRef.current) return

      const answersRecord: Record<string, string> = {}
      for (const [idx, ans] of Object.entries(answersRef.current)) {
        answersRecord[e.questions[Number(idx)].id] = ans
      }

      const key = JSON.stringify(answersRecord)
      if (key === lastSavedKeyRef.current) return

      const elapsedSeconds = Math.floor((Date.now() - sa) / 1000)

      setSaveStatus("saving")
      try {
        await api.saveExamAnswers(e.id, answersRecord, elapsedSeconds)
        setLastSavedKey(key)
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch (err: any) {
        addToast("Auto-save failed: " + (err.message || "unknown error"), "info")
        setSaveStatus("idle")
      }
    }
  }, [addToast])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    }
  }, [])

  // Elapsed time timer (updates every second)
  useEffect(() => {
    if (startedAt !== null && !submitted) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000))
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startedAt, submitted])

  // Auto-save on question change
  useEffect(() => {
    if (!exam || submitted || startedAt === null) return
    doSaveRef.current()
  }, [currentIndex])

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!exam || submitted || startedAt === null) return
    saveTimerRef.current = setInterval(() => {
      doSaveRef.current()
    }, 30000)
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    }
  }, [exam?.id, submitted, startedAt])

  // Load saved exams + style profile
  useEffect(() => {
    if (!selectedCourse) return
    api.listExams(selectedCourse.id).then((r) => setSavedExams(r.exams)).catch(() => setSavedExams([]))
    api.getExamStyle(selectedCourse.id).then((r) => {
      const profile = r.profile?.style_profile || null
      if (profile) {
        const tPct = toPct(profile.question_type_distribution || {})
        const dPct = toPct(profile.difficulty_distribution || {})
        setTypePct(tPct)
        setDiffPct(dPct)
        setInitialTypePct({ ...tPct })
        setInitialDiffPct({ ...dPct })
      }
    }).catch(() => {})
  }, [selectedCourse])

  const generate = async () => {
    if (!selectedCourse) return
    setGenerating(true)
    setProgress({ done: 0, total: config.numQuestions })
    setSubmitted(false)
    setExamResults(null)
    setImportedWrongs(false)
    try {
      const typeDist = Object.keys(typePct).length > 0
        ? Object.fromEntries(Object.entries(typePct).map(([k, v]) => [k, v / 100]))
        : null
      const diffDist = Object.keys(diffPct).length > 0
        ? Object.fromEntries(Object.entries(diffPct).map(([k, v]) => [k, v / 100]))
        : null

      const result = await api.generateExam({
        courseId: selectedCourse.id,
        numQuestions: config.numQuestions,
        typeDistribution: typeDist,
        difficultyDistribution: diffDist,
        extraPrompt: config.extraPrompt,
        timeLimitMinutes: config.timeLimitMinutes > 0 ? config.timeLimitMinutes : undefined,
        bankRatio: config.bankRatio,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setExam(result)
      setCurrentIndex(0)
      setAnswers({})
      setStartedAt(Date.now())
      setElapsed(0)
      setLastSavedKey("")
      addToast("Exam generated", "success")
      api.listExams(selectedCourse.id).then((r) => setSavedExams(r.exams)).catch(() => {})
    } catch (e: any) {
      addToast(e.message || "Failed to generate exam", "error")
    } finally {
      setGenerating(false)
    }
  }

  const resumeExam = async (examId: string) => {
    try {
      const e = await api.getExam(examId)
      if (e.error) {
        addToast(e.error, "error")
        return
      }
      setExam(e)
      setCurrentIndex(0)
      // Restore saved answers: backend stores { question_id: answer }, frontend uses { index: answer }
      const restored: Record<number, string> = {}
      if (e.saved_answers && e.questions) {
        e.questions.forEach((q: any, idx: number) => {
          if (e.saved_answers[q.id]) {
            restored[idx] = e.saved_answers[q.id]
          }
        })
      }
      setAnswers(restored)

      if (e.status === "completed" && e.results) {
        // Show results view for completed exams
        setExamResults({
          total: e.questions.length,
          correct_count: e.results.filter((r: any) => r.correct === true).length,
          accuracy: e.results.filter((r: any) => r.correct === true).length / e.questions.length,
          results: e.results,
        })
        setSubmitted(true)
        setStartedAt(null)
        setElapsed(e.duration_seconds || 0)
      } else {
        // In-progress exam: resume taking it
        setSubmitted(false)
        setExamResults(null)
        if (e.status === "in_progress" && e.elapsed_seconds) {
          setStartedAt(Date.now() - e.elapsed_seconds * 1000)
          setElapsed(e.elapsed_seconds)
        } else {
          setStartedAt(null)
          setElapsed(0)
        }
      }
      setLastSavedKey("")
    } catch (e: any) {
      addToast(e.message || "Failed to load exam", "error")
    }
  }

  const handleSubmit = async () => {
    if (!selectedCourse || !exam || submitting) return
    const answeredCount = Object.keys(answers).length
    const unanswered = exam.questions.length - answeredCount
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question(s). Submit anyway?`
      : "Submit this exam for grading? You won't be able to change your answers after."
    if (!confirm(msg)) return
    setSubmitting(true)
    try {
      const elapsedSeconds = startedAt !== null ? Math.floor((Date.now() - startedAt) / 1000) : 0
      const answerList = exam.questions.map((q: any, idx: number) => ({
        question_id: q.id,
        answer: answers[idx] || "",
      }))
      const result = await api.submitExam(selectedCourse.id, exam.id, answerList, elapsedSeconds)
      setExamResults(result)
      setSubmitted(true)
      if (timerRef.current) clearInterval(timerRef.current)
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      api.listExams(selectedCourse.id).then((r) => setSavedExams(r.exams)).catch(() => {})
    } catch (e: any) {
      addToast(e.message || "Failed to submit exam. Please retry.", "error")
      // Do NOT set submitted=true — let the user retry submission
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const handleTypeDelta = (key: string, delta: number) => {
    const next = { ...typePct }
    next[key] = Math.max(0, (next[key] || 0) + delta)
    setTypePct(normalizeDist(next))
  }

  const handleDiffDelta = (key: string, delta: number) => {
    const next = { ...diffPct }
    next[key] = Math.max(0, (next[key] || 0) + delta)
    setDiffPct(normalizeDist(next))
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("exam")}</h1>
        <p className="mt-2 text-sm text-slate-muted">{t("selectCourse")}</p>
      </div>
    )
  }

  if (generating) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 size={24} className="mx-auto mb-4 animate-spin text-coral" />
          <p className="text-sm text-slate-muted">
            Generating question {progress.done} of {progress.total}...
          </p>
          <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-ivory-deep">
            <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-light">{pct}%</p>
        </CardContent>
      </Card>
    )
  }

  if (!exam) {
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("exam")}</h1>
        <p className="mt-2 text-sm text-slate-muted">Generate a paper that imitates the style profile of {selectedCourse.name}.</p>

        {/* Saved exams */}
        {savedExams.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("savedExams")}</CardTitle>
              <CardDescription>Resume an unfinished exam or review a completed one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedExams.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-ivory px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-slate-muted">
                      {e.num_questions} questions · {e.status} · {new Date(e.created_at).toLocaleString()}
                      {e.time_limit_minutes ? ` · ${e.time_limit_minutes} min` : ""}
                      {e.status === "completed" && e.accuracy != null
                        ? ` · ${Math.round(e.accuracy * 100)}%`
                        : ""}
                      {e.elapsed_seconds != null
                        ? ` · ${formatTime(e.elapsed_seconds)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => resumeExam(e.id)}>
                      {e.status === "completed" ? "Review" : "Resume"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      await api.deleteExam(e.id)
                      setSavedExams((prev) => prev.filter((x) => x.id !== e.id))
                    }}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Config panel */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 size={18} /> Generation settings
            </CardTitle>
            <CardDescription>Tune the exam composition. Defaults come from the course style profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-muted">Number of questions</label>
              <input
                type="number"
                min={1}
                max={20}
                value={config.numQuestions}
                onChange={(e) => setConfig({ ...config, numQuestions: Math.max(1, Math.min(20, parseInt(e.target.value) || 10)) })}
                className="w-24 rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-muted">Time limit (minutes, 0 = no limit)</label>
              <input
                type="number"
                min={0}
                max={180}
                value={config.timeLimitMinutes}
                onChange={(e) => setConfig({ ...config, timeLimitMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-24 rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              />
            </div>

            {/* Bank / AI ratio */}
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-muted">Bank / AI question ratio</label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-muted">Bank</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.bankRatio}
                  onChange={(e) => setConfig({ ...config, bankRatio: parseInt(e.target.value) })}
                  className="flex-1 accent-coral"
                />
                <span className="text-xs text-slate-muted">AI</span>
                <span className="w-10 text-right text-sm font-medium">{config.bankRatio}%</span>
              </div>

              <div className="mt-1 flex justify-between text-xs text-slate-light">
                <span>Bank questions {config.bankRatio}%</span>
                <span>AI generated {100 - config.bankRatio}%</span>
              </div>
              <p className="mt-2 rounded-lg bg-coral/5 px-3 py-2 text-xs text-slate-muted">
                Estimated AI calls: <span className="font-mono font-medium text-slate-ink">{Math.ceil(config.numQuestions * (100 - config.bankRatio) / 100)}</span> · remaining questions reuse the bank
              </p>
            </div>

            <details className="rounded-xl border border-border bg-ivory px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">Advanced composition</summary>
              <div className="mt-4 space-y-5 border-t border-border pt-4">
            {/* Interactive type distribution */}
            {Object.keys(typePct).length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-muted">Question type distribution</p>
                <div className="space-y-2">
                  {Object.entries(typePct).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm text-slate-muted">{label(k, TYPE_LABELS)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ivory-deep">
                        <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${v}%` }} />
                      </div>
                      <span className="w-8 text-right text-sm font-medium">{v}%</span>
                      <Button variant="ghost" size="sm" onClick={() => handleTypeDelta(k, -5)} disabled={v <= 0}>
                        <Minus size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleTypeDelta(k, 5)} disabled={v >= 100}>
                        <Plus size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setTypePct({ ...initialTypePct })}>
                  Reset to profile
                </Button>
              </div>
            )}

            {/* Interactive difficulty distribution */}
            {Object.keys(diffPct).length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-muted">Difficulty distribution</p>
                <div className="space-y-2">
                  {Object.entries(diffPct).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm text-slate-muted">{label(k, DIFF_LABELS)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ivory-deep">
                        <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${v}%` }} />
                      </div>
                      <span className="w-8 text-right text-sm font-medium">{v}%</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDiffDelta(k, -5)} disabled={v <= 0}>
                        <Minus size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDiffDelta(k, 5)} disabled={v >= 100}>
                        <Plus size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setDiffPct({ ...initialDiffPct })}>
                  Reset to profile
                </Button>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-muted">Extra instructions (optional)</label>
              <textarea
                value={config.extraPrompt}
                onChange={(e) => setConfig({ ...config, extraPrompt: e.target.value })}
                placeholder="e.g. Focus on proofs, avoid multiple choice, emphasize linear algebra..."
                className="min-h-[80px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
              />
            </div>
              </div>
            </details>

            <Button variant="coral" onClick={generate}>{t("generateExam")}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const current = exam.questions[currentIndex]
  const total = exam.questions.length

  // Submitted / results view
  if (submitted) {
    const wrongCount = examResults?.results?.filter((r: any) => !r.correct).length ?? 0
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("examResults")}</h1>
        {examResults ? (
          <>
            <div className="mt-4 flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-semibold">{examResults.correct_count}/{examResults.total}</p>
                <p className="text-xs text-slate-muted">Correct</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-semibold">{Math.round(examResults.accuracy * 100)}%</p>
                <p className="text-xs text-slate-muted">Accuracy</p>
              </div>
              {startedAt && (
                <div className="text-center">
                  <p className="text-3xl font-semibold">{formatTime(elapsed)}</p>
                  <p className="text-xs text-slate-muted">Time spent</p>
                </div>
              )}
            </div>

            {/* Import wrong to practice */}
            {wrongCount > 0 && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importedWrongs}
                  onClick={async () => {
                    try {
                      const result = await api.exportWrongs(exam.id)
                      setImportedWrongs(true)
                      addToast(`Imported ${result.imported} wrong answers. Check Review page to redo them.`, "success")
                    } catch (e: any) {
                      addToast("Failed to import: " + (e.message || "unknown error"), "error")
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  {importedWrongs
                    ? "Already imported"
                    : `Import ${wrongCount} wrong answers to practice`}
                </Button>
              </div>
            )}

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Question-by-question results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {examResults.results.map((result: any, index: number) => {
                  const question = exam.questions[index]
                  return (
                    <div key={index} className={cn(
                      "rounded-xl border p-4",
                      result.correct === true ? "border-success/20 bg-success/5"
                      : result.correct === null ? "border-warning/20 bg-warning/5"
                      : "border-danger/20 bg-danger/5"
                    )}>
                      <div className="flex items-start gap-3">
                        {result.correct === true ? (
                          <CheckCircle size={18} className="mt-0.5 shrink-0 text-success" />
                        ) : result.correct === null ? (
                          <AlertCircle size={18} className="mt-0.5 shrink-0 text-warning" />
                        ) : (
                          <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-muted">Q{index + 1}</p>
                          <div className="mt-1 text-sm"><MathRenderer content={question.content} /></div>
                          {answers[index] ? (
                            <p className="mt-2 text-xs"><span className="text-slate-muted">Your answer:</span> {answers[index]}</p>
                          ) : (
                            <p className="mt-2 text-xs text-slate-muted">No answer submitted</p>
                          )}
                          {result.feedback && (
                            <p className="mt-1 text-xs text-slate-muted">{result.feedback}</p>
                          )}
                          {/* Structured feedback */}
                          {!result.correct && result.missing_steps?.length > 0 && (
                            <div className="mt-1 text-xs">
                              <span className="text-slate-muted">Missing steps:</span>
                              <ul className="ml-3 list-disc">
                                {result.missing_steps.map((step: string, i: number) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {!result.correct && result.wrong_concepts?.length > 0 && (
                            <div className="mt-1 text-xs">
                              <span className="text-slate-muted">Watch out for:</span>
                              <ul className="ml-3 list-disc">
                                {result.wrong_concepts.map((c: string, i: number) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {!result.correct && result.suggestion && (
                            <p className="mt-1 text-xs italic text-slate-muted">{result.suggestion}</p>
                          )}
                          {!result.correct && result.correct_answer && (
                            <p className="mt-1 text-xs"><span className="text-slate-muted">Expected:</span> {result.correct_answer}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-muted">Submission failed. Try generating a new paper.</p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => { setExam(null); setSubmitted(false); setStartedAt(null) }}>Back to exams</Button>
          <Button variant="coral" onClick={generate}>Generate another paper</Button>
        </div>
      </div>
    )
  }

  // In-progress exam
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{t("exam")}</h1>
          <p className="mt-2 text-sm text-slate-muted">{selectedCourse.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {startedAt !== null && !submitted && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ivory-deep px-3 py-1.5 text-sm text-slate-ink">
                <Clock size={16} />
                {formatTime(elapsed)}
              </span>
              {saveStatus === "saving" && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-light">
                  <Loader2 size={12} className="animate-spin" /> Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Save size={12} /> Saved ✓
                </span>
              )}
            </>
          )}
          <span className="text-sm text-slate-muted">{Object.values(answers).filter((a) => a && a.trim()).length}/{total} answered</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {exam.questions.map((_: any, index: number) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "h-8 w-8 rounded-lg text-xs",
              currentIndex === index
                ? "border border-coral/40 bg-coral/10 text-coral"
                : answers[index]
                ? "bg-ivory-deep text-slate-ink"
                : "bg-ivory text-slate-muted"
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            {current.question_type && (
              <span className="rounded bg-ivory-deep px-2 py-0.5 text-xs text-slate-muted">
                {label(current.question_type, TYPE_LABELS)}
              </span>
            )}
            {current.difficulty && (
              <span className="rounded bg-ivory-deep px-2 py-0.5 text-xs text-slate-muted">
                {label(current.difficulty, DIFF_LABELS)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-relaxed">
            <MathRenderer content={current.content} />
          </div>

          {current.question_type === "mcq" && current.options?.length ? (
            <div className="mt-4 space-y-2">
              {current.options.map((option: string, index: number) => (
                <button
                  key={index}
                  onClick={() => setAnswers((prev) => ({ ...prev, [currentIndex]: option }))}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left text-sm",
                    answers[currentIndex] === option ? "border-coral bg-coral/5" : "border-border bg-ivory"
                  )}
                >
                  <MathRenderer content={option} />
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[currentIndex] || ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [currentIndex]: e.target.value }))}
              className="mt-4 min-h-[140px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
              placeholder="Write your answer..."
            />
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>
              <ChevronLeft size={16} /> Previous
            </Button>
            {currentIndex === total - 1 ? (
              <Button variant="coral" size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit exam"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCurrentIndex((value) => Math.min(total - 1, value + 1))}>
                Next <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
