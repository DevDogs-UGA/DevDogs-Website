// middleware.ts

import { NextResponse } from "next/server";

export async function middleware(req) {
  const cookie = await req.cookies.get("connect.sid");

  // Check if the cookie exists
  if (!cookie) {
    console.log("Cookie not found, redirecting to login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const res = await fetch("https://api.devdogs.uga.edu/auth/session", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookie.name}=${cookie.value}`,
      },
    });

    console.log(res, res.status);

    if (res.status !== 200) {
      console.log("Authentication failed, redirecting to login");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Allow the request to proceed
    return NextResponse.next();
  } catch (error) {
    console.error("Error during authentication:", error);
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

// Apply middleware to specific routes (e.g., protect /dashboard)
export const config = {
  matcher: ["/dashboard/:path*"], // Routes that need authentication
};
