"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    const completeSignIn = async () => {
      const code = searchParams.get("code");

      if (!code) {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          router.replace("/");
          return;
        }

        setMessage("Missing login code. Request a new magic link.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Supabase auth callback failed", error);
        setMessage(error.message || "Could not complete sign-in.");
        return;
      }

      router.replace("/");
    };

    void completeSignIn();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1C] px-6 text-center text-white">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111827] p-6">
        <p className="text-sm text-gray-300">{message}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0A0F1C] px-6 text-center text-white">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#111827] p-6">
            <p className="text-sm text-gray-300">Completing sign-in...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
