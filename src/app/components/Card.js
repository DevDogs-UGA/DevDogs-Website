import "./Card.css"
import Image from "next/image";

const Card = (props) => {
    return (
        <div className="officer-card">
            <Image id="pic" src={props.image} width="400" height="450" />
            <div id="officer-description">
                <br />
                <h2 class="officer-name">{props.name}</h2>
                <p id="officer-title-name">{props.title}</p>
            </div>
        </div>
    )
}

export default Card;