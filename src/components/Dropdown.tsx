import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "选择...",
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "glass-input flex items-center justify-between gap-2 cursor-pointer",
          "min-w-[120px] pr-2",
          open && "border-primary dark:border-primary-light"
        )}
      >
        <span className="truncate text-sm whitespace-nowrap">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="glass-dropdown absolute top-full left-0 mt-1 min-w-full z-[100] py-1 animate-scale-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm cursor-pointer whitespace-nowrap",
                "transition-colors duration-150",
                "hover:bg-primary/10 dark:hover:bg-primary-light/10",
                opt.value === value &&
                  "text-primary dark:text-primary-light font-medium"
              )}
            >
              <span>{opt.label}</span>
              {opt.description && (
                <span className="block text-xs text-fg-muted dark:text-fg-dark-muted mt-0.5">
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
