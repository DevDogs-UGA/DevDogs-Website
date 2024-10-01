import PropTypes from "prop-types";

const LeaderCard = (props) => {
  return (
    <div className="w-[30%] bg-[#33334d] m-2 flex flex-col text-[#d9ecec] rounded-xl p-2">
        <div className="flex justify-center pb-2">
            <a href={"https://github.com/" + props.github} target="_blank">
                {props.github}
            </a>
        </div>

        <div className="flex justify-center pt-2">
            <div>
                Points: <b>{props.points}</b>
            </div>
        </div>
    </div>
  );
};

export default LeaderCard;

LeaderCard.propTypes = {
    github: PropTypes.string,
    points: PropTypes.number
  };