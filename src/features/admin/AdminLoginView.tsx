import { Eye, EyeOff, Lock } from "lucide-react";
import type { FormEvent } from "react";

export interface AdminLoginViewProps {
  password: string;
  showPassword: boolean;
  error: string;
  isLoggingIn: boolean;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AdminLoginView({
  password,
  showPassword,
  error,
  isLoggingIn,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
}: AdminLoginViewProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl shadow-xl p-8 space-y-5"
      >
        <div className="w-12 h-12 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center">
          <Lock size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-serif">Admin Login</h1>
          <p className="text-sm text-stone-500 mt-1">
            Enter the owner password to edit this menu.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-stone-400"
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center text-stone-400 hover:text-stone-900 transition-colors"
              title={showPassword ? "Hide password" : "Show password"}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoggingIn}
          className="w-full bg-stone-900 text-stone-50 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-stone-800 disabled:opacity-60 transition-colors"
        >
          {isLoggingIn ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}