"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StepSliderProps {
  stepKey: number;
  children: ReactNode;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

const transition = {
  x: { type: "spring" as const, stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

export function StepSlider({ stepKey, children }: StepSliderProps) {
  const [slide, setSlide] = useState({ prev: stepKey, direction: 1 });

  if (stepKey !== slide.prev) {
    setSlide({ prev: stepKey, direction: stepKey > slide.prev ? 1 : -1 });
  }

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait" custom={slide.direction}>
        <motion.div
          key={stepKey}
          custom={slide.direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
