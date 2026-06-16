/* ------------------------------------------------------------------ */
/*  useEffortVariants — loads the effort-variant spec for the current  */
/*  model from /providers/models/:provider/:model/variants and reads  */
/*  the user's stored preference from `variant:<modelId>`.            */
/* ------------------------------------------------------------------ */

import { useEffect } from "react";
import { storage } from "../lib/storage";
import { apiGet } from "../lib/api-client";
import { parseSelectedModel } from "../lib/chat-format";
import type { EffortSpec } from "../types/chat";

interface EffortArgs {
  selectedModel: string | null;
  multiMode: boolean;
  setIsEffortDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEffortSearch: React.Dispatch<React.SetStateAction<string>>;
  setEffortSpec: React.Dispatch<React.SetStateAction<EffortSpec | null>>;
  setSelectedEffort: React.Dispatch<React.SetStateAction<string>>;
  setEffortLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useEffortVariants({
  selectedModel,
  multiMode,
  setIsEffortDropdownOpen,
  setEffortSearch,
  setEffortSpec,
  setSelectedEffort,
  setEffortLoading,
}: EffortArgs): void {
  useEffect(() => {
    setIsEffortDropdownOpen(false);
    setEffortSearch("");

    if (!selectedModel || multiMode) {
      setEffortSpec(null);
      setSelectedEffort("default");
      setEffortLoading(false);
      return;
    }

    const token = storage.get("token");
    if (!token) {
      setEffortSpec(null);
      setSelectedEffort("default");
      setEffortLoading(false);
      return;
    }

    const parsedModel = parseSelectedModel(selectedModel);
    if (!parsedModel) {
      setEffortSpec(null);
      setSelectedEffort("default");
      return;
    }
    const { provider, modelId } = parsedModel;

    let aborted = false;
    setEffortLoading(true);
    apiGet<{ spec: EffortSpec | null }>(`/providers/models/${encodeURIComponent(provider)}/${encodeURIComponent(modelId)}/variants`)
      .then((data) => {
        if (aborted) return;
        const spec = data.spec ?? null;
        setEffortSpec(spec);

        const stored = storage.get(`variant:${selectedModel}`);
        const next = spec?.variants.some((variant) => variant.id === stored) ? stored! : "default";
        setSelectedEffort(next);
      })
      .catch(() => {
        if (aborted) return;
        setEffortSpec(null);
        setSelectedEffort("default");
      })
      .finally(() => {
        if (!aborted) setEffortLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [selectedModel, multiMode, setIsEffortDropdownOpen, setEffortSearch, setEffortSpec, setSelectedEffort, setEffortLoading]);
}
