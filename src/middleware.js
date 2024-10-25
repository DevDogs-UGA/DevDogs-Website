// middleware.ts

import { NextResponse } from "next/server";

export async function middleware(req) {
  const cookie = await req.cookies.get("connect.sid");

  if (cookie) {
    const res = await fetch("https://api.devdogs.uga.edu/auth/session", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookie.name}=${cookie.value}`,
      },
    });

    if (res.status !== 200) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } else {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Apply middleware to specific routes
export const config = {
  matcher: ["/dashboard/:path*"], // Routes that need authentication
};
