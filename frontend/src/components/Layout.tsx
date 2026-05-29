import { useEffect, useMemo, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  BookOpen,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Target,
} from "lucide-react"

import { type Course, api } from "@/lib/api"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/upload", icon: FolderOpen, label: "Materials" },
  { to: "/questions", icon: BookOpen, label: "Question Bank" },
  { to: "/practice", icon: Target, label: "Practice" },
  { to: "/exam", icon: FileText, label: "Mock Exam" },
]

export interface LayoutContextValue {
  courses: Course[]
  selectedCourse: Course | null
  refreshCourses: () => Promise<void>
  selectCourse: (courseId: string) => void
}

const STORAGE_KEY = "exam-cloner:selected-course-id"

export function Layout() {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>(localStorage.getItem(STORAGE_KEY) || "")
  const [newCourseName, setNewCourseName] = useState("")
  const [creating, setCreating] = useState(false)

  const refreshCourses = async () => {
    const response = await api.listCourses()
    setCourses(response.courses)
    if (!selectedCourseId && response.courses[0]) {
      setSelectedCourseId(response.courses[0].id)
      localStorage.setItem(STORAGE_KEY, response.courses[0].id)
    }
  }

  useEffect(() => {
    refreshCourses().catch(() => {})
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
      await refreshCourses()
      selectCourse(course.id)
    } finally {
      setCreating(false)
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
      <div className="mx-auto flex min-h-screen max-w-[1440px] gap-6 px-5 py-5 lg:px-8">
        <aside className="w-[260px] shrink-0 rounded-2xl border border-border bg-ivory-deep p-5">
          <div className="mb-6">
            <p className="font-serif text-xl leading-tight">Exam Cloner</p>
            <p className="mt-1 text-xs text-slate-muted">
              Build a course workspace from exams, slides, and homework.
            </p>
          </div>

          <div className="mb-5 rounded-xl border border-border bg-ivory-card p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-muted">
              Current course
            </p>
            <select
              value={selectedCourseId}
              onChange={(e) => selectCourse(e.target.value)}
              className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
            {selectedCourse && (
              <p className="mt-2 text-xs text-slate-muted">
                Active workspace: <span className="text-slate-ink">{selectedCourse.name}</span>
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-border bg-ivory-card p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-muted">
              New course
            </p>
            <div className="flex gap-2">
              <input
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="e.g. MATH 101"
                className="min-w-0 flex-1 rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={createCourse}
                disabled={!newCourseName.trim() || creating}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-ivory hover:bg-ivory-warm disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
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

          <div className="mt-8 border-t border-border pt-4 text-[11px] uppercase tracking-[0.16em] text-slate-muted">
            HKUST(GZ) AI+ competition build
          </div>
        </aside>

        <main className="min-w-0 flex-1 rounded-[28px] border border-border bg-ivory-card px-8 py-8">
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  )
}
