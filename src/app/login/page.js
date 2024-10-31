"use client";

import { useState, useEffect } from "react";
import PageTitleTemplate from "../components/PageTitleTemplate";
// import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/input-otp";
// import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { useRouter } from "next/navigation";
import { FaCheck, FaTimes, FaEye, FaEyeSlash } from "react-icons/fa";

const Page = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showing, setShowing] = useState(false);
  // const [verifyEmail, setVerifyEmail] = useState(false);
  // const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState("");
  // const [showPassword, setShowPassword] = useState(false);
  // const [passwordCriteria, setPasswordCriteria] = useState({
  //   length: false,
  //   uppercase: false,
  //   lowercase: false,
  //   number: false,
  //   specialChar: false,
  // });

  const router = useRouter();

  const validateEmail = (email) => {
    const regex = /@uga\.edu$/;
    return regex.test(email);
  };

  // const EmailVerification = () => {
  //   const verify = async () => {
  //     try {
  //       const data = await fetch("https://api.devdogs.uga.edu/auth/verifyEmail", {
  //         method: "POST",
  //         credentials: "include",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           email_address: sessionStorage.getItem("email"),
  //           code: code,
  //         }),
  //       });
  //       console.log(await data.json());
  //       if (data.status == 200) {
  //         console.log("User created");
  //       } else {
  //         console.log("User not created");
  //       }
  //     } catch (error) {
  //       console.error(error);
  //     }
  //   };

  //   return (
  //     <div className="text-center w-full page-main-side-padding flex justify-center">
  //       <div className="bg-[#F5F5F5] w-96 rounded-[50px] shadow-sm p-4">
  //         <h3 className="text-2xl font-bold">Email Address</h3>
  //         <h2 href="/" className="text-sm">
  //           Enter the code sent to your email below.
  //         </h2>
  //         <div className="flex justify-center m-3">
  //           <InputOTP
  //             maxLength={6}
  //             value={code}
  //             pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
  //             onChange={(value) => setCode(value)}
  //           >
  //             <InputOTPGroup>
  //               <InputOTPSlot index={0} />
  //               <InputOTPSlot index={1} />
  //               <InputOTPSlot index={2} />
  //               <InputOTPSlot index={3} />
  //               <InputOTPSlot index={4} />
  //               <InputOTPSlot index={5} />
  //             </InputOTPGroup>
  //           </InputOTP>
  //         </div>
  //         {/* <h2
  //           href="https://docs.google.com/document/d/15sB5OFGq7j07ftnRuLdBKjrsmi-B9o-euBiC60CdGoo/edit?usp=sharing"
  //           className="text-[#00A3AD] underline text-md"
  //         >
  //           Resend Code
  //         </h2> */}
  //         <button
  //           onClick={() => verify()}
  //           className="w-48 text-white bg-[#BA0C2F] p-2 mt-3 rounded-[183px] shadow-sm"
  //         >
  //           Check
  //         </button>
  //       </div>
  //     </div>
  //   );
  // };

  const CreateAccount = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [passwordCriteria, setPasswordCriteria] = useState({
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      specialChar: false,
    });

    const validateEmail = (email) => {
      const regex = /@uga\.edu$/;
      return regex.test(email);
    };

    const validatePassword = (password) => {
      setPasswordCriteria({
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      });
    };

    useEffect(() => {
      validatePassword(password);
    }, [password]);

    const create = async () => {
      setEmailError("");

      if (!validateEmail(email)) {
        setEmailError("Please use a valid @uga.edu email address.");
        return;
      }

      if (!Object.values(passwordCriteria).every(Boolean)) {
        return;
      }

      try {
        const data = await fetch(
          "https://api.devdogs.uga.edu/auth/createUser",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_address: email,
              password: password,
            }),
          },
        );

        if (data.status == 200) {
          console.log("User created");
          //   setVerifyEmail(true);
          sessionStorage.setItem("email", email);
          const res = await data.json();

          sessionStorage.setItem("access_token", await res.access_token);

          router.push("/dashboard");
        } else {
          console.log("User not created");
        }
      } catch (error) {
        console.error("Account creation failed:", error);
      }
    };

    const togglePasswordVisibility = () => {
      setShowPassword(!showPassword);
    };

    return (
      <div className="page-main-side-padding flex w-full justify-center text-center">
        <div className="w-96 rounded-[50px] bg-[#F5F5F5] p-4 shadow-sm">
          <h3 className="text-2xl font-bold">Email Address</h3>
          <input
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl p-2"
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-500">{emailError}</p>
          )}
          <h2 className="mt-2 text-sm">
            Use your UGA email address (@uga.edu)
          </h2>
          <h3 className="mt-4 text-2xl font-bold">Password</h3>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl p-2 pr-10"
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute inset-y-0 right-0 flex items-center justify-end pr-3"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <div className="mt-2 text-left">
            <p className="text-sm font-semibold">Password must have:</p>
            <ul className="text-sm">
              {Object.entries(passwordCriteria).map(([criterion, isValid]) => (
                <li key={criterion} className="flex items-center">
                  {isValid ? (
                    <FaCheck className="mr-2 text-green-500" />
                  ) : (
                    <FaTimes className="mr-2 text-red-500" />
                  )}
                  {criterion === "length" && "At least 8 characters"}
                  {criterion === "uppercase" && "One uppercase letter"}
                  {criterion === "lowercase" && "One lowercase letter"}
                  {criterion === "number" && "One number"}
                  {criterion === "specialChar" && "One special character"}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={create}
            className="mt-4 rounded-full bg-BulldogRed px-4 py-2 text-white"
            disabled={!Object.values(passwordCriteria).every(Boolean)}
          >
            Create Account
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const response = await fetch("https://api.devdogs.uga.edu/auth/session", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(await response.json());
      if (response.status === 200) {
        setIsAuthenticated(true);
        setLoading(false);
      } else {
        setIsAuthenticated(false);
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to check authentication:", err);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  } else {
    const token = sessionStorage.getItem("access_token");
    if (isAuthenticated && token) {
      router.push("/dashboard");
    } else {
      // continue
    }
  }

  const login = async () => {
    if (!validateEmail(email)) {
      setEmailError("Please use a valid @uga.edu email address.");
      return;
    }
    setEmailError("");

    try {
      const response = await fetch("https://api.devdogs.uga.edu/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: email,
          password: password,
        }),
      });

      if (response.status !== 200) {
        setShowing(true);
        return;
      }

      const data = await response.json();
      console.log(data);
      sessionStorage.setItem("email", email);
      sessionStorage.setItem("access_token", await data.access_token);
      router.refresh();
      router.push("/dashboard");
    } catch (error) {
      setShowing(true);
      console.error("Login failed:", error);
    }
    // setVerifyEmail(true);
  };

  return (
    <div className="section page-main-side-padding w-full text-center">
      <PageTitleTemplate
        blackText={"Returning User? "}
        redText={"Log In"}
        reverse={true}
      />

      <div className="page-main-side-padding flex w-full justify-center text-center">
        <div className="w-96 rounded-[50px] bg-[#F5F5F5] p-4 shadow-sm">
          <h3 className="text-2xl font-bold">Email Address</h3>
          <input
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl p-2"
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-500">{emailError}</p>
          )}
          <h2 className="mt-2 text-sm">
            Use your UGA email address (@uga.edu)
          </h2>
          <h3 className="text-2xl font-bold">Password</h3>
          <input
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl p-2"
          />
          {/* <div className="mt-3">
            <a href="/" className="text-[#00A3AD] underline text-md">
              Forgot My Password{" "}
            </a>
          </div> */}
          {showing ? (
            <h2 className="mt-2 text-lg font-semibold text-BulldogRed">
              User with that email and password not found.
            </h2>
          ) : null}
          <button
            onClick={() => login()}
            className="mt-6 w-48 rounded-[183px] bg-[#BA0C2F] p-2 text-white shadow-sm"
          >
            Log In
          </button>
        </div>
      </div>

      <div className="my-[4rem] text-center">
        <h2 className="text-[2.5rem] font-bold text-BulldogRed md:text-[3.5rem] lg:text-[4rem]">
          Create an Account
        </h2>
      </div>

      <CreateAccount />
      {/* {verifyEmail ? <EmailVerification /> : <CreateAccount />} */}
    </div>
  );
};

export default Page;
