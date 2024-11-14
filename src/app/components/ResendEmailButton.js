"use client";

import { useState, useEffect } from "react";
import { Button } from "../components/shadcn-button.jsx";
import { Loader2, Send } from "lucide-react";

export default function ResendEmailButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSentTime, setLastSentTime] = useState(null);
  const [canResend, setCanResend] = useState(true);

  useEffect(() => {
    const now = Date.now();
    if (lastSentTime) {
      const timeDiff = now - lastSentTime;
      // Check if 30 minutes (1800000 milliseconds) have passed
      if (timeDiff < 1800000) {
        setCanResend(false);
        const remainingTime = 1800000 - timeDiff;
        const timer = setTimeout(() => {
          setCanResend(true);
        }, remainingTime);
        return () => clearTimeout(timer);
      }
    }
  }, [lastSentTime]);

  const resendEmail = async () => {
    try {
      const token = sessionStorage.getItem("access_token");

      await fetch("http://localhost:4000/auth/resendEmail", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResend = async () => {
    if (!canResend) {
      setMessage("You can only resend the email every 30 minutes.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const result = await resendEmail();

    setIsLoading(false);

    setLastSentTime(Date.now()); // Update the last sent time
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <Button
        onClick={handleResend}
        disabled={isLoading || !canResend}
        className="rounded-full bg-DevDogBlue"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Verify Your Email
          </>
        )}
      </Button>
      {message && (
        <p
          className={`text-sm ${message.includes("successfully") ? "text-green-600" : "text-red-600"}`}
        >
          {message}
        </p>
      )}
      {!canResend && (
        <p className="text-sm text-gray-500">
          Please wait 30 minutes before resending the email.
        </p>
      )}
    </div>
  );
}
