// middleware.ts

import { NextResponse } from "next/server";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authenticateWithRetry(cookie, retries = 0) {
  try {
    const res = await fetch("https://api.devdogs.uga.edu/auth/session", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookie.name}=${cookie.value}`,
      },
    });

    console.log(`Attempt ${retries + 1}:`, res.status);

    if (res.status === 200) {
      return true;
    } else if (retries < MAX_RETRIES) {
      await wait(RETRY_DELAY);
      return authenticateWithRetry(cookie, retries + 1);
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error during authentication:", error);
    if (retries < MAX_RETRIES) {
      await wait(RETRY_DELAY);
      return authenticateWithRetry(cookie, retries + 1);
    } else {
      return false;
    }
  }
}

export async function middleware(req) {
  const cookie = await req.cookies.get("connect.sid");

  const isAuthenticated = await authenticateWithRetry(cookie);

  if (!isAuthenticated) {
    console.log("Authentication failed after retries, redirecting to login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Apply middleware to specific routes (e.g., protect /dashboard)
export const config = {
  matcher: ["/dashboard/:path*"], // Routes that need authentication
};
