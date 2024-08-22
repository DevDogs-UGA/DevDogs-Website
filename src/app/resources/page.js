import ResourceList from "../components/ResourceList";

const ResourcePage = () => {
  return (
    <div className="section section-resources">
      <div id="resourcestitle">
        <h1>
          <b id="devdawgs">Resources</b>
        </h1>
      </div>

      <br></br>
      <br></br>

      <div id="resourcestitle">
        <ResourceList />
        <ResourceList />
      </div>
    </div>
  );
};

export default ResourcePage;
