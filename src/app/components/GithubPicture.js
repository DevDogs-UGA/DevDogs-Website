const GithubPicture = (member) => {
  let data = member.member;
  return (
    <div className="officer-card m-2">
      <img id="pic" src={"https://github.com/" + data.githubLogin + ".png"} />
      <div id="officer-description">
        <br />
        <a
          href={"https://github.com/" + data.githubLogin}
          target="_blank"
          className="officer-name font-bold"
          rel="noreferrer"
        >
          {data.fullName}
        </a>
        <p id="officer-title-name">{Math.round(data.points)} points</p>
        <br />
      </div>
    </div>
  );
};

export default GithubPicture;
