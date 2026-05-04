"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const login = async () => {
    const configuredSiteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : undefined);

    const emailRedirectTo =
      configuredSiteUrl
        ? `${configuredSiteUrl}/auth/callback`
        : typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      console.error("Supabase OTP login failed", error);
      setMessage(error.message || "Error sending link");
    } else {
      setMessage("Check your email for the login link 📩");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#0A0F1C]">
      <div className="bg-[#111827] p-6 rounded-2xl border border-gray-700 w-80 space-y-4">
        <h1 className="text-xl font-bold text-white text-center">
          Login
        </h1>

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded-lg bg-black border border-gray-700 text-white"
        />

        <button
          onClick={login}
          className="w-full bg-cyan-500 text-black py-2 rounded-lg hover:shadow-[0_0_10px_#00F5FF]"
        >
          Send Magic Link
        </button>

        {message && (
          <p className="text-sm text-gray-400 text-center">{message}</p>
        )}
      </div>
    </div>
  );
}
