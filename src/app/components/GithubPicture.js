import { OpenInNewWindowIcon } from "@radix-ui/react-icons";

const GithubPicture = (member) => {
  let data = member.member;
  return (
    <div className="officer-card mx-14 my-6">
      <img id="pic" src={"https://github.com/" + data.githubLogin + ".png"} />
      {data.paid ? (
        <div id="officer-description">
          <br />
          <a
            className="flex items-center w-full justify-center"
            href={"/dog/" + data.githubLogin}
          >
            <a className="officer-name font-bold mr-1">{data.fullName}</a>
            <OpenInNewWindowIcon />
          </a>
          <p id="officer-title-name">{Math.round(data.points)} points</p>
          <br />
        </div>
      ) : (
        <div id="officer-description">
          <br />
          <a className="flex items-center w-full justify-center">
            <a className="officer-name font-bold mr-1">{data.fullName}</a>
          </a>
          <p id="officer-title-name">{Math.round(data.points)} points</p>
          <br />
        </div>
      )}
    </div>
  );
};

export default GithubPicture;
