import { useEffect, useMemo, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  BookOpen,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  History,
  Menu,
  X,
  Cpu,
  Languages,
} from "lucide-react"

import { type Course, api } from "@/lib/api"
import { useToast } from "@/components/Toast"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n"

export interface LayoutContextValue {
  courses: Course[]
  selectedCourse: Course | null
  refreshCourses: () => Promise<void>
  selectCourse: (courseId: string) => void
}

const STORAGE_KEY = "exam-cloner:selected-course-id"

interface CourseMeta {
  questionCount: number
  mastery: number
}

export function Layout() {
  const { language, setLanguage, t } = useLanguage()
  const { addToast } = useToast()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>(localStorage.getItem(STORAGE_KEY) || "")
  const [newCourseName, setNewCourseName] = useState("")
  const [creating, setCreating] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [meta, setMeta] = useState<Record<string, CourseMeta>>({})
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showCreateCourse, setShowCreateCourse] = useState(false)

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t("overview") },
    { to: "/upload", icon: FolderOpen, label: t("materials") },
    { to: "/questions", icon: BookOpen, label: t("questions") },
    { to: "/practice", icon: Target, label: t("practice") },
    { to: "/exam", icon: FileText, label: t("exam") },
    { to: "/review", icon: History, label: t("review") },
    { to: "/compute", icon: Cpu, label: t("compute") },
    { to: "/settings", icon: SettingsIcon, label: t("settings") },
  ]

  const refreshCourses = async () => {
    try {
      const response = await api.listCourses()
      setCourses(response.courses)
      if (!selectedCourseId && response.courses[0]) {
        setSelectedCourseId(response.courses[0].id)
        localStorage.setItem(STORAGE_KEY, response.courses[0].id)
      }
    } catch {
      /* handled by caller */
    }
  }

  // Fetch per-course meta (question count + mastery) for the switcher.
  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      const next: Record<string, CourseMeta> = {}
      await Promise.all(
        courses.map(async (c) => {
          try {
            const s = await api.getStats(c.id)
            if (!cancelled) {
              const masteryValues = Object.values(s.concept_mastery || {}).map((m) => m.score)
              next[c.id] = {
                questionCount: s.total_questions_in_bank,
                mastery: masteryValues.length
                  ? masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length
                  : 0,
              }
            }
          } catch {
            next[c.id] = { questionCount: 0, mastery: 0 }
          }
        })
      )
      if (!cancelled) setMeta(next)
    }
    if (courses.length) loadMeta()
    return () => { cancelled = true }
  }, [courses])

  useEffect(() => {
    refreshCourses().catch(() => addToast("Failed to load courses", "error"))
  }, [])

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  )

  const selectCourse = (courseId: string) => {
    setSelectedCourseId(courseId)
    localStorage.setItem(STORAGE_KEY, courseId)
  }

  const createCourse = async () => {
    const name = newCourseName.trim()
    if (!name) return
    setCreating(true)
    try {
      const course = await api.createCourse(name)
      setNewCourseName("")
      setShowCreateCourse(false)
      await refreshCourses()
      selectCourse(course.id)
      addToast(`Course "${name}" created`, "success")
    } catch (e: any) {
      addToast(e.message || "Failed to create course", "error")
    } finally {
      setCreating(false)
    }
  }

  const seedDemo = async () => {
    setSeeding(true)
    try {
      const res = await api.seedDemo()
      if (res.status === "exists") {
        addToast("Demo course already loaded", "info")
        if (res.course) selectCourse(res.course.id)
      } else {
        addToast(`Demo loaded: ${res.questions_loaded} questions`, "success")
        if (res.course) selectCourse(res.course.id)
      }
      await refreshCourses()
    } catch (e: any) {
      addToast(e.message || "Failed to load demo", "error")
    } finally {
      setSeeding(false)
    }
  }

  const contextValue: LayoutContextValue = {
    courses,
    selectedCourse,
    refreshCourses,
    selectCourse,
  }

  return (
    <div className="min-h-screen bg-ivory text-slate-ink">
      {/* Mobile top bar with hamburger — only visible on mobile */}
      <div className="flex items-center gap-3 border-b border-border bg-ivory-deep px-4 py-3 lg:hidden">
        <button onClick={() => setMobileNavOpen(true)} className="rounded-lg p-1.5 hover:bg-ivory-warm">
          <Menu size={20} />
        </button>
        <p className="font-serif text-lg">Exam Cloner</p>
      </div>

      <div className="mx-auto flex max-w-[1440px] gap-6 px-4 py-4 lg:px-8 lg:py-5">
        {/* Mobile overlay backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Sidebar — fixed on mobile (slides in), sticky on desktop */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-r-2xl border-r border-border bg-ivory-deep p-5 transition-transform lg:sticky lg:top-5 lg:z-auto lg:h-[calc(100vh-2.5rem)] lg:rounded-2xl lg:border lg:border-border lg:transition-none",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="mb-5">
            <p className="font-serif text-xl leading-tight">Exam Cloner</p>
            <p className="mt-1 text-xs text-slate-muted">Resource-aware adaptive learning.</p>
          </div>

          {/* Course switcher — compact list with question count + mastery bar */}
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-muted">{t("courses")}</p>
            <div className="flex items-center gap-1">
              <button
                onClick={seedDemo}
                disabled={seeding}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-coral hover:bg-coral/10 disabled:opacity-50"
                title="Load a ready-made demo course"
              >
                <Sparkles size={11} /> {seeding ? t("loading") : t("demo")}
              </button>
              <button onClick={() => setShowCreateCourse((value) => !value)} className="rounded-md p-1 text-slate-muted hover:bg-coral/10 hover:text-coral" aria-label={t("newCourse")}><Plus size={13} /></button>
            </div>
          </div>

          <div className="mb-4 max-h-[240px] space-y-1 overflow-y-auto pr-1">
            {courses.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-slate-muted">
                {t("noCourses")}
              </p>
            ) : (
              courses.map((course) => {
                const m = meta[course.id]
                const isActive = course.id === selectedCourseId
                return (
                  <button
                    key={course.id}
                    onClick={() => { selectCourse(course.id); setMobileNavOpen(false) }}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      isActive
                        ? "border-coral/30 bg-coral/8"
                        : "border-transparent hover:bg-ivory-card"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", isActive ? "text-slate-ink" : "text-slate-muted")}>
                        {course.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-ivory px-1.5 py-0.5 text-[10px] text-slate-muted">
                        {m ? m.questionCount : <span className="inline-block h-2.5 w-4 animate-pulse rounded bg-border" />}
                      </span>
                    </div>
                    {m && m.questionCount > 0 && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ivory">
                        <div
                          className="h-full rounded-full bg-coral/60"
                          style={{ width: `${Math.round(m.mastery * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* New course */}
          {showCreateCourse && <div className="mb-6 rounded-xl border border-border bg-ivory-card p-2">
            <div className="flex gap-2">
              <input
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCourse()}
                placeholder={t("courseName")}
                className="min-w-0 flex-1 rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={createCourse}
                disabled={!newCourseName.trim() || creating}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-ivory hover:bg-ivory-warm disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
            <button onClick={() => setShowCreateCourse(false)} className="mt-1 text-[11px] text-slate-muted hover:text-slate-ink">{t("cancel")}</button>
          </div>}

          <nav className="shrink-0 space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "border border-coral/30 bg-coral/8 text-slate-ink"
                      : "text-slate-muted hover:bg-ivory-card hover:text-slate-ink"
                  )
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-3 border-t border-border pt-4">
            <button onClick={() => setLanguage(language === "en" ? "zh-CN" : "en")} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-slate-muted hover:bg-ivory-card hover:text-slate-ink"><span className="flex items-center gap-2"><Languages size={14} />{t("language")}</span><span className="font-medium">{language === "en" ? "中文" : "EN"}</span></button>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-muted">CCF Computility 2026</p>
          </div>

          {/* Close button — only on mobile, top-right of sidebar */}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="absolute right-3 top-3 rounded-lg p-1.5 hover:bg-ivory-warm lg:hidden"
          >
            <X size={18} />
          </button>
        </aside>

        <main className="min-w-0 flex-1 rounded-[28px] border border-border bg-ivory-card px-4 py-6 lg:px-8 lg:py-8" style={{ minHeight: "calc(100vh - 2.5rem)" }}>
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  )
}
