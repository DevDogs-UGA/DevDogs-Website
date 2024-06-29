import "./Footer.css"
import React from 'react';

export default function Footer() {
  return (
    <div className="footer">
        <p><b id="UGA-Devdogs">&copy;2024 DevDogs at the University of Georgia</b></p>
        <br />
        <div class="box" id="align-links">
          <a class="footerlink" href={'mailto:devdogs.uga@gmail.com'}>Email</a>
          <a class="footerlink" href={'https://github.com/DevDogs-UGA'}>Github</a>
          <a class="footerlink" href={'https://www.linkedin.com/company/devdogs-uga/'}>LinkedIn</a>
          <a class="footerlink" href={'https://linktr.ee/devdogs'}>Linktree</a>
        </div>
    </div>
  )
}