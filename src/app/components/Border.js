import React from "react"
import "./Border.css"
import {Card, CardHeader, CardBody, CardFooter} from "@nextui-org/card";

const Border = ({
  title,
  titleColor
}) => {
  return (
    <div className="card-container">
      <Card>
        <CardBody>
          <h1 className="card-title">{title}</h1>
        </CardBody>
      </Card>
    </div>
  );
}

export default Border;