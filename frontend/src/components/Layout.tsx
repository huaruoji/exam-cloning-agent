import { NavLink, Outlet } from "react-router-dom"
import {
  LayoutDashboard,
  Upload,
  BookOpen,
  Target,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/questions", icon: BookOpen, label: "Question Bank" },
  { to: "/practice", icon: Target, label: "Practice" },
  { to: "/exam", icon: FileText, label: "Mock Exam" },
]

export function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-slate-dark flex flex-col py-6">
        <div className="px-6 mb-8">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            Exam Cloner
          </h1>
          <p className="text-xs text-slate-light mt-1">AI-powered study tool</p>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-white/10 text-white font-medium"
                    : "text-slate-light hover:text-white hover:bg-white/5"
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 mt-auto">
          <div className="border-t border-white/10 pt-4">
            <p className="text-[11px] text-slate-light/60">
              HKUST(GZ) AI+ Competition
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-ivory">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
