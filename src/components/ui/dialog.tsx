"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizeClasses = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Dialog({ open, onOpenChange, title, children, size = "md" }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-50 w-full ${sizeClasses[size]} -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 max-h-[85vh] overflow-y-auto`}
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="size-5" strokeWidth={1.75} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
