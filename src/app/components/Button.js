import "./Button.css";
import PropTypes from "prop-types";

const Button = (props) => {
  return (
    <div className="button">
      <button
        id={props.id}
        type={props.type || "button"}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    </div>
  );
};

export default Button;

Button.propTypes = {
  id: PropTypes.string,
  type: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node,
};
