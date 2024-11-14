import { OpenInNewWindowIcon } from "@radix-ui/react-icons";

const GithubPicture = (member) => {
  let data = member.member;
  return (
    <div className="officer-card mx-14 my-6">
      <img
        id="pic"
        src={data.pfp_link || "https://github.com/" + data.githubLogin + ".png"}
      />
      {data.paid ? (
        <div id="officer-description">
          <br />
          <a
            className="flex w-full items-center justify-center"
            href={"/dog/" + data.githubLogin}
          >
            <a className="officer-name mr-1 font-bold">{data.fullName}</a>
            <OpenInNewWindowIcon />
          </a>
          <p id="officer-title-name">{Math.round(data.points)} points</p>
          <br />
        </div>
      ) : (
        <div id="officer-description">
          <br />
          <a className="flex w-full items-center justify-center">
            <a className="officer-name mr-1 font-bold">{data.fullName}</a>
          </a>
          <p id="officer-title-name">{Math.round(data.points)} points</p>
          <br />
        </div>
      )}
    </div>
  );
};

export default GithubPicture;
