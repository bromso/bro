import type React from "react";
import { cn } from "@/lib/utils";

interface SectionTitleProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export function SectionTitle({ children, className, ...props }: SectionTitleProps) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase text-muted-foreground tracking-wider",
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
}
