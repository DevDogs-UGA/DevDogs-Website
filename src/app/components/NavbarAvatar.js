"use client";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.jsx";
import { Button } from "./button.jsx";
import { User, Settings, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NavBarAvatar() {
  const [imageUrl, setImageUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState(null);

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setToken(sessionStorage.getItem("access_token"));
      setEmail(sessionStorage.getItem("email"));
    }
  }, []);

  const logout = async () => {
    try {
      await fetch("https://api.devdogs.uga.edu/auth/logout", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      console.log("Logged out");
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    }
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!token || !email) {
          return;
        }

        const response = await fetch(
          "https://api.devdogs.uga.edu/users/user_page",
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
          },
        );

        const res = await response.json();
        console.log(await res.data);
        if (await res.data) {
          setUser(await res.data);
        }
        if ((await res.data?.accessToken) && typeof window !== "undefined") {
          sessionStorage.setItem("access_token", await res.data.accessToken);
        }
        setImageUrl(res.data?.user_page.pfp_link);
      } catch (err) {
        console.error(err);
      }
    };

    fetchUser();
  }, [token, email]);

  return (
    <div className="ml-4 mt-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={imageUrl || "https://github.com/null.png"}
                alt="@username"
                className="h-10 w-10"
              />
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 bg-[#31304b] text-white"
          align="end"
          forceMount
        >
          {user?.user_page?.userInfo ? (
            <div>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user.user_page.userInfo?.first_name}{" "}
                    {user.user_page.userInfo?.last_name}
                  </p>
                  <p>{user.user_page.userInfo?.email_address}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </div>
          ) : null}
          {user?.user_page?.paid &&
          user?.user_page?.userInfo?.users?.githubLogin ? (
            <a href={"/dog/" + user.user_page.userInfo.users.githubLogin}>
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>My Page</span>
              </DropdownMenuItem>
            </a>
          ) : user?.user_page?.userInfo?.user_id && !user?.user_page?.paid ? (
            <a
              href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:MEM.DEV:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
              target="_blank"
              rel="noreferrer"
            >
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Pay Dues</span>
              </DropdownMenuItem>
            </a>
          ) : user?.user_page?.paid &&
            !user?.user_page?.userInfo?.users?.githubLogin ? (
            <a href="/dashboard">
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Link GitHub</span>
              </DropdownMenuItem>
            </a>
          ) : null}
          <a href="/dashboard">
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </DropdownMenuItem>
          </a>
          <DropdownMenuSeparator />
          {user ? (
            <div onClick={logout}>
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </div>
          ) : (
            <a href="/login">
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Login</span>
              </DropdownMenuItem>
            </a>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
