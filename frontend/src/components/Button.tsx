import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { forwardRef, type ButtonHTMLAttributes } from "react"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-slate-ink text-white hover:bg-slate-ink/90",
        coral: "bg-coral text-white hover:bg-coral-hover",
        outline: "border border-border bg-transparent hover:bg-ivory-warm",
        ghost: "hover:bg-ivory-warm",
        destructive: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button, buttonVariants }
