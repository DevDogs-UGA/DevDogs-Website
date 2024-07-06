import { Inter } from "next/font/google"
import { Metadata } from 'next'
import NavBar from "./components/NavBar"
import Footer from "./components/Footer"
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });



export const metadata = {
  title: "DevDogs",
  description: "Building software with a purpose at the University of Georgia.",
  // Not sure if this viewport changes anything, doesn't when localhost testing
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};
 
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div id="base-background">
          <NavBar />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
