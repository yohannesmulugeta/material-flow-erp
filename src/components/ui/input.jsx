import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, inputMode, ...props }, ref) => {
  // Auto-set inputmode for number fields → shows numeric keypad on mobile
  // prevents iOS zoom-on-focus (keeps font-size at 16px)
  const resolvedInputMode = inputMode || (type === 'number' ? 'decimal' : undefined);

  return (
    <input
      type={type}
      inputMode={resolvedInputMode}
      className={cn(
        // height: 44px minimum for touch target compliance
        "flex h-11 w-full rounded-xl border border-input bg-transparent px-3 py-2",
        // font-size: 16px prevents iOS auto-zoom on focus
        "text-base placeholder:text-muted-foreground",
        // Transitions: focus glow + border color
        "transition-all duration-200",
        "shadow-sm hover:border-border/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
})
Input.displayName = "Input"

export { Input }
