/**
 * v0 by Vercel.
 * @see https://v0.dev/t/B1PFCpV9wdE
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card.jsx";
import { Input } from "./input.jsx";
import { Button } from "./button.jsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTrigger,
} from "./alert-dialog.jsx";

import PropTypes from "prop-types";
import { useState } from "react";
import { put } from "@vercel/blob";
import { process } from "process";

export default function FormDrop(props) {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("Cancel");

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  // Handle file submission
  const handleSubmit = async () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }

    // Example: Uploading the file using FormData and fetch API
    const formData = new FormData();
    formData.append("file", file);

    try {
      let email = sessionStorage.getItem("email");
      email = email.split("@")[0];
      const { url: response } = await put(email, file, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      if (response) {
        props.onUrlChange(await response);
        setText("Done");
      } else {
        alert("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file");
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="mt-1 w-full">
          Change Picture
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload your file</CardTitle>
            <CardDescription className="text-center">
              File size should not exceed 4.5MB
            </CardDescription>
          </CardHeader>
          <CardContent className="flex w-full flex-col justify-center space-y-4">
            <div className="flex justify-center">
              <Input
                id="file"
                type="file"
                accept="image/*"
                className="w-11/12 align-middle"
                onChange={handleFileChange}
              />
            </div>
            <AlertDialogCancel className="w-full">{text}</AlertDialogCancel>
            <Button className="w-full" onClick={handleSubmit}>
              Submit
            </Button>
          </CardContent>
        </Card>
      </AlertDialogContent>
    </AlertDialog>
  );
}

FormDrop.propTypes = {
  onUrlChange: PropTypes.func,
};
