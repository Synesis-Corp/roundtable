import { storage } from "../lib/storage";
import { useNavigate } from "react-router-dom";
import { openOAuthPopup } from "../lib/oauth-popup";
import { IS_NEW_KEY } from "../lib/onboarding-helpers";

/**
 * "Sign in with GitHub" button. Opens a popup to /api/auth/github, which
 * redirects to github.com, and waits for the popup to post the app JWT back
 * via the standard OAuth code flow (see `apps/api/src/routes/auth.ts`). The
 * button renders nothing when VITE_GITHUB_ENABLED is unset, mirroring the
 * degraded UI of the Google button when VITE_GOOGLE_CLIENT_ID is missing.
 */
export default function GitHubSignInButton({
  onError,
}: {
  onError?: (message: string) => void;
}) {
  const navigate = useNavigate();
  // Opt-out: the button shows by default. The operator sets
  // VITE_GITHUB_ENABLED=false to hide it. The backend will return 503 if
  // GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET aren't set, so a click on an
  // unconfigured button shows a clean error instead of a dead UI.
  const enabled = import.meta.env.VITE_GITHUB_ENABLED !== "false";

  if (!enabled) return null;

  const handleClick = () => {
    openOAuthPopup({
      url: "/api/auth/github",
      popupName: "github-oauth",
      onSuccess: (token, created) => {
        storage.set("token", token);
        if (created) storage.set(IS_NEW_KEY, "1");
        navigate("/");
      },
      onError: (message) => onError?.(message),
    });
  };

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={handleClick}
        className="w-full max-w-[320px] flex items-center justify-center gap-2 rounded-full border border-gray-700/60 bg-[var(--bg-elevated)] hover:bg-[var(--hover)] text-gray-200 hover:text-white text-sm font-medium py-2.5 transition-colors"
        data-testid="github-signin-button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.07.78 2.16v3.21c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
        </svg>
        <span>Continue with GitHub</span>
      </button>
    </div>
  );
}
