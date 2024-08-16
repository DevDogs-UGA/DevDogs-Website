import "./Footer.css"
import React from 'react';
import Link from "next/link"


export default function Footer()
{
  return (
    <div className="footer">
      <p><b id="UGA-Devdogs">&copy; {(new Date().getFullYear())} DevDogs at the University of Georgia</b></p>
      <br />
      <div className="box text-black" id="align-links">
        <Link target="_blank" className="hover:underline visited:text-white" href={'mailto:devdogs@uga.edu'}>Email</Link>
        <Link target="_blank" className="hover:underline visited:text-white" href={'https://github.com/DevDogs-UGA'}>Github</Link>
        <Link target="_blank" className="hover:underline visited:text-white" href={'https://www.linkedin.com/company/devdogs-uga/'}>LinkedIn</Link>
        <Link target="_blank" className="hover:underline visited:text-white" href={'https://linktr.ee/devdogs'}>Linktree</Link>
      </div>
    </div>
  )
}
