import "./Card.css";
import Image from "next/image";
import PropTypes from "prop-types";

const Card = (props) => {
  return (
    <div className="officer-card">
      <Image id="pic" src={props.image} width="400" height="450" />
      <div id="officer-description">
        <br />
        <h2 className="officer-name font-bold">{props.name}</h2>
        <p id="officer-title-name">{props.title}</p>
        <br />
      </div>
    </div>
  );
};

export default Card;

Card.propTypes = {
  image: PropTypes.string,
  name: PropTypes.string,
  title: PropTypes.string,
};
