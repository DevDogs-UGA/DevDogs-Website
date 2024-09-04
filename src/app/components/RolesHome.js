import { useState, useEffect } from "react";

export default function RolesHome() {
  const roles = [
    "Developers",
    "UI Designers",
    "Impact-Havers",
    "Data Gurus",
    "Leaders",
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % roles.length);
        setFade(true);
      }, 500); // Wait for the fade-out to complete before changing text
    }, 3000); // Change role every 3 seconds

    return () => clearInterval(interval);
  }, [roles.length]);

  return (
    <div className="text-right text-BulldogRed font-extrabold text-[3rem] md:text-[4rem] lg:text-[5rem]">
      <h1
        className={`font-bold transition-opacity duration-500 ease-in-out transform ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      >
        {roles[currentIndex]}
      </h1>
    </div>
  );
}
