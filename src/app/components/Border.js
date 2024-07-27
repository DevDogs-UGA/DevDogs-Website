import React from "react"
import "./Border.css"
import { Card, CardBody } from "@nextui-org/card";

const Border = ({ title }) => {
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