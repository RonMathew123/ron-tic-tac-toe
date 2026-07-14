import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface NeonButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "cyan" | "magenta" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}

export function NeonButton({
  children, onClick, variant = "cyan", className, disabled, type = "button",
}: NeonButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "font-display uppercase tracking-widest text-sm sm:text-base px-6 py-3 rounded-lg transition-all",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "cyan" && "neon-border-cyan neon-text-cyan bg-[oklch(0.18_0.03_285_/_0.5)] hover:bg-[oklch(0.86_0.19_210_/_0.15)]",
        variant === "magenta" && "neon-border-magenta neon-text-magenta bg-[oklch(0.18_0.03_285_/_0.5)] hover:bg-[oklch(0.72_0.32_340_/_0.15)]",
        variant === "ghost" && "border border-border/70 text-foreground/80 hover:text-foreground hover:border-foreground/40",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
