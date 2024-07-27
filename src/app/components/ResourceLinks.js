import GitHubLogo from "../images/githublogotransparent.png"
import HTMLLogo from "../images/htmllogotransparent.png"

/** How to use add resources:
  * 1. add id, resourceName, and a png transparent image to the images folder, then import like above
  * 2. add your links as an array, and then an array of the same length with titles for each link that will
  *   display on the website.
  *
  * Format:
  *   id: int
  *   resourceName: String
  *   resourceLogo: image variable reference
  *   links: String array [same length]
  *   linkNames: string array [same length]
  */

const ResourceLinks = [{
  id: 0,
  resourceName: 'GitHub',
  resourceLogo: GitHubLogo,
  links: ["https://www.slideshare.net/slideshow/git-101-git-and-github-for-beginners/53063631", "https://www.slideshare.net/Simplilearn/git-tutorial-for-beginners-what-is-git-and-github-devops-tools-devops-tutorial-simplilearn", "https://docs.github.com/en/get-started"],
  linkNames: ["Github-Intro-Slides", "Github-Intro-Slides2", "GitHub-Get-Started"]
}, {
  id: 1,
  resourceName: 'HTML',
  resourceLogo: HTMLLogo,
  links: ["https://www.w3schools.com/html/html_intro.asp", "https://www.w3schools.com/html/html_elements.asp"],
  linkNames: ["HTML-Intro", "HTML-Elements"]
}];

export default ResourceLinks;