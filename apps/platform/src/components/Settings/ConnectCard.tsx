import type { ReactNode } from "react";
import { Card } from "~/ui/card";

/**
 * The centred card the `devtools oauth` approval pages sit on (connect and
 * device). Styled by analogy with the sign-in card in `signin.html`: one
 * framed card on the page ground with a display heading, a plain sentence of
 * what is being asked, and the actions.
 */
export default function ConnectCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="section" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="wrap" style={{ display: "grid", placeItems: "center" }}>
        <Card
          className="w-full max-w-lg"
          style={{ padding: "clamp(20px, 6vw, 32px)" }}
        >
          <h1 className="display" style={{ fontSize: 30, margin: "0 0 8px" }}>
            {title}
          </h1>
          {description && <p style={{ margin: "0 0 24px" }}>{description}</p>}
          {children}
        </Card>
      </div>
    </section>
  );
}
