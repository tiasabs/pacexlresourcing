"use client";

import { useEffect, useState } from "react";

const storageKey = "resourcing-radar-reduce-motion";

export function MotionToggle() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(storageKey);
    const storedPreference = storedValue === null
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : storedValue === "true";
    setReduceMotion(storedPreference);
    document.documentElement.dataset.motion = storedPreference ? "reduced" : "full";
    setReady(true);
  }, []);

  function toggleMotion() {
    const nextValue = !reduceMotion;
    setReduceMotion(nextValue);
    window.localStorage.setItem(storageKey, String(nextValue));
    document.documentElement.dataset.motion = nextValue ? "reduced" : "full";
  }

  return (
    <button
      aria-pressed={reduceMotion}
      className="motion-toggle"
      onClick={toggleMotion}
      type="button"
    >
      Motion: {ready && reduceMotion ? "Reduced" : "On"}
    </button>
  );
}
