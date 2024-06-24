import React from "react"
import {Listbox, ListboxSection, ListboxItem} from "@nextui-org/listbox"
import {ListboxWrapper} from "./ListboxWrapper"
import ResourceLinks from "./ResourceLinks"
import "./ResourceList.css"


function ConstructLinks ({
  linksArr,
  linkNamesArr,
}) {
  return (
    linksArr.map((link, index) =>
      <div className="links-list">
        
        <li>
          <a href={link} id="link-color">{linkNamesArr[index]}</a>
        </li>
        
        
      </div>
    )
  
    
  )
}


const ResourceList = () => {
  return (
    ResourceLinks.map(resource =>
    <div id="padding" className="resource-card-container">
      
      <div className="horizontal-align">
        <div className="header-image">
          <img src={resource.resourceLogo.src} alt={resource.resourcename} width="100" height="150"></img>
        </div>
        <div className="header-title">
          <h2>{resource.resourceName}</h2>
        </div>
        <div className="list">
          <ul id="resourceLinks">
            <ConstructLinks linksArr={resource.links} linkNamesArr={resource.linkNames}/>
          </ul>
      </div>
      </div>
      
    </div>
    
    )
  )
}

export default ResourceList;