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
    // Handle form submission logic here, e.g., sending the data to an API.
    // console.log(formData);
  };

  return (
    <div>
      <div className="text-center mt-20 mb-10">
        <p className="inline text-[3rem] font-bold text-UGASecondary ">
          Direct{" "}
        </p>
        <p className="inline text-[3rem] font-bold text-black">Message</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] mx-auto px-[3rem] py-[2rem] md:px-[5rem] md:py-[3rem] bg-[#f5f5f5] shadow-md "
      >
        <div className="mb-4">
          <label
            htmlFor="fullname"
            className="pl-4 block text-xl font-extrabold "
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
            className="font-bold mt-1 block w-full px-4 py-2   rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-UGASecondary"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="email" className="pl-4 block text-xl font-extrabold ">
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
            className="font-bold mt-1 block w-full px-4 py-2  rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-UGASecondary"
          />
        </div>
        <div className="mb-4 ">
          <label
            htmlFor="message"
            className="pl-4 block text-xl font-extrabold "
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
            className="font-bold mt-1 block resize-none w-full px-4 py-2  rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-UGASecondary "
          />
        </div>
        <div className="flex justify-center">
          <button
            type="submit"
            className="w-[40%] py-2 bg-UGA text-white font-medium text-xl rounded-full hover:bg-black transition ease-in-out duration-150"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
