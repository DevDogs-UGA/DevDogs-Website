import Image from "next/image";
import "./page.module.css";
import "./Home.css"
import NavBar from "./components/NavBar";
const Home = () => {
  return (
    <div>
      <NavBar />
      <div id="hometitle" className="grid">
        <h1 id="titleheader">DevDawgs @ UGA</h1>
        <img src="./favicon.ico" alt="DevDawgs Logo"/>
      </div>
    </div>
  )
}

export default Home;