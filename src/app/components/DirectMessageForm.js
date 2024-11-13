"use client";
import { useState } from "react";

export default function DirectMessageForm() {
  const [formData, setFormData] = useState({
    fullname: "",
    email: "",
    message: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const { fullname, email, message } = formData;
    const subject = encodeURIComponent(`Message from ${fullname}`);
    const body = encodeURIComponent(
      `Full Name: ${fullname}\nEmail: ${email}\n\nMessage:\n${message}`,
    );

    window.location.replace(
      `mailto:devdogs@uga.edu?subject=${subject}&body=${body}`,
    );
  };

  return (
    <div className="m-0 flex w-full flex-col p-0">
      <div className="mb-10 mt-20 text-center">
        <p className="inline text-[3rem] font-bold text-BulldogRed">Direct </p>
        <p className="inline text-[3rem] font-bold text-black">Message</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full rounded-[2rem] bg-[#f5f5f5] px-[1.5rem] py-[2rem] shadow-md sm:px-[2rem] md:px-[5rem] md:py-[3rem]"
      >
        <div className="mb-4">
          <label
            htmlFor="fullname"
            className="block pl-4 text-xl font-extrabold"
          >
            Full Name
          </label>
          <input
            type="text"
            id="fullname"
            name="fullname"
            placeholder="Dev Dawg"
            value={formData.fullname}
            onChange={handleChange}
            className="mt-1 block w-full rounded-xl px-4 py-2 font-bold shadow-sm outline-none focus:ring-2 focus:ring-BulldogRed"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="email" className="block pl-4 text-xl font-extrabold">
            Email Address{" "}
            <p className="inline text-sm font-medium">(required)</p>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="hello@email.com"
            required
            className="mt-1 block w-full rounded-xl px-4 py-2 font-bold shadow-sm outline-none focus:ring-2 focus:ring-BulldogRed"
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="message"
            className="block pl-4 text-xl font-extrabold"
          >
            Message <p className="inline text-sm font-medium">(required)</p>
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            placeholder="Your message here..."
            rows="4"
            className="mt-1 block w-full resize-none rounded-xl px-4 py-2 font-bold shadow-sm outline-none focus:ring-2 focus:ring-BulldogRed"
          />
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            className="rounded-full bg-GloryGloryRed py-2 text-xl font-medium text-white transition duration-150 ease-in-out hover:bg-black sm:w-[40%]"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
