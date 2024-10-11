const GithubPicture = (member) => {
  return (
    <div className="officer-card m-2">
      <img id="pic" src={"https://github.com/" + member.githubLogin + ".png"} />
      <div id="officer-description">
        <br />
        <a
          href={"https://github.com/" + member.githubLogin}
          target="_blank"
          className="officer-name font-bold"
          rel="noreferrer"
        >
          {member.fullName}
        </a>
        <p id="officer-title-name">{Math.round(member.points)} points</p>
        <br />
      </div>
    </div>
  );
};

export default GithubPicture;
