import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import PropTypes from "prop-types";
import "./globals.css";

export const metadata = {
  title: "DevDogs",
  description: "Building software with a purpose at the University of Georgia.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div id="base-background">
          <NavBar />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}

RootLayout.propTypes = {
  children: PropTypes.node,
};
