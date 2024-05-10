import "./Button.css"

const Button = (props) => {
    return (
        <div className="button">
            <button id ={props.id} type={props.type || "button"} onClick={props.onClick}>{props.children}</button>
        </div>
    )
}

export default Button;