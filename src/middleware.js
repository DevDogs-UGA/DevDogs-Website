// middleware.ts

import { NextResponse } from "next/server";

export async function middleware(req) {
  const cookie = req.cookies.get("connect.sid");

  const res = await fetch("https://api.devdogs.uga.edu/auth/session", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie?.name + "=" + cookie?.value,
    },
  });


  if (req.cookies.has("connect.sid")) {
    const res = await fetch("https://api.devdogs.uga.edu/auth/session", {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${await cookie?.name}=${await cookie?.value}`,
      },
    });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Apply middleware to specific routes (e.g., protect /dashboard)
export const config = {
  matcher: ["/dashboard/:path*"], // Routes that need authentication
};
