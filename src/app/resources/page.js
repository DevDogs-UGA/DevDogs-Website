import Card from "../components/Border"
import ResourceList from "../components/ResourceList"
import ResourceLinks from "../components/ResourceLinks"
import GitHubLogo from "../images/githublogotransparent.png"
import HTMLLogo from "../images/htmllogotransparent.png"

const ResourcePage = () => {
    return (
        <div className="section section-resources">
            <div id="resourcestitle">
                <h1><b id="devdawgs">Resources</b></h1>
            </div>

            <br></br>
            <br></br>

            <div id="resourcestitle">
                <ResourceList />
                <ResourceList />
            </div>
            
        </div>
    )
}

export default ResourcePage;