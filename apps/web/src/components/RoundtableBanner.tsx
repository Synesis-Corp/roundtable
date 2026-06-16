import { RoundtableMark } from "./RoundtableMark";
import type { MultiInfo } from "../types/chat";

/** Orchestration banner shown while Roundtable plans and runs subtasks. */
export function RoundtableBanner({ multiInfo }: { multiInfo: MultiInfo }) {
  if (!multiInfo.plan) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4">
      <div className="rounded-xl border border-purple-700/40 bg-gradient-to-r from-purple-900/20 to-blue-900/20 px-4 py-3">
        <div className="flex items-center gap-2 text-purple-300 text-sm font-medium mb-2">
          <RoundtableMark className="w-4 h-4" />
          Roundtable: convening the Council
        </div>
        <ul className="text-xs text-gray-300 space-y-1">
          {multiInfo.plan.map((step, i) => (
            <li key={i} className="flex gap-2"><span className="text-purple-400">{i + 1}.</span>{step}</li>
          ))}
        </ul>
        {multiInfo.contributors && (
          <div className="mt-3 pt-3 border-t border-purple-700/30 flex flex-wrap gap-1.5">
            {multiInfo.contributors.map((c, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-200 border border-purple-700/30">
                {c.provider} · {c.model}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
