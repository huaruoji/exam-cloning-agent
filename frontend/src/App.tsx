import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { ToastProvider } from "@/components/Toast"

const Dashboard = lazy(() => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })))
const Upload = lazy(() => import("@/pages/Upload").then((module) => ({ default: module.Upload })))
const QuestionBank = lazy(() => import("@/pages/QuestionBank").then((module) => ({ default: module.QuestionBank })))
const Practice = lazy(() => import("@/pages/Practice").then((module) => ({ default: module.Practice })))
const MockExam = lazy(() => import("@/pages/MockExam").then((module) => ({ default: module.MockExam })))
const Review = lazy(() => import("@/pages/Review").then((module) => ({ default: module.Review })))
const Settings = lazy(() => import("@/pages/Settings").then((module) => ({ default: module.Settings })))
const Compute = lazy(() => import("@/pages/Compute").then((module) => ({ default: module.Compute })))

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ivory text-sm text-slate-muted">Loading workspace…</div>}><Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/questions" element={<QuestionBank />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/exam" element={<MockExam />} />
            <Route path="/review" element={<Review />} />
            <Route path="/compute" element={<Compute />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <h1 className="font-serif text-4xl">404</h1>
                <p className="mt-2 text-sm text-slate-muted">This page doesn't exist.</p>
              </div>
            } />
          </Route>
        </Routes></Suspense>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
