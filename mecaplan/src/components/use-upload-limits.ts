"use client";
import { useEffect, useState } from "react";
export function useUploadLimits() {
  const [limits, setLimits] = useState({
    importBytes: 5 * 1024 * 1024,
    documentBytes: 10 * 1024 * 1024,
  });
  useEffect(() => {
    let active = true;
    fetch("/api/limits", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((v) => {
        if (
          active &&
          Number.isFinite(v.importBytes) &&
          Number.isFinite(v.documentBytes)
        )
          setLimits(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return limits;
}
