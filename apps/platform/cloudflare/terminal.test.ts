import { describe, expect, it, vi } from "vitest";
import { serveTerminal } from "./terminal";

const CURL = { "user-agent": "curl/8.5.0", accept: "*/*" };

function app(respond: (request: Request) => Response) {
  return vi.fn(async (request: Request) => respond(request));
}

describe("serveTerminal", () => {
  it("lets browsers through", async () => {
    const fetchApp = app(() => new Response("html"));
    const request = new Request("https://devdogsuga.org/events", {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
    });
    expect(await serveTerminal(request, fetchApp)).toBeNull();
    expect(fetchApp).not.toHaveBeenCalled();
  });

  it("forwards known paths to /terminal", async () => {
    const fetchApp = app(
      (request) =>
        new Response(
          new URL(request.url).pathname + new URL(request.url).search,
        ),
    );
    const root = await serveTerminal(
      new Request("https://devdogsuga.org/", { headers: CURL }),
      fetchApp,
    );
    expect(await root!.text()).toBe("/terminal?format=ansi");
    const issue = await serveTerminal(
      new Request("https://devdogsuga.org/changelog/3.0.2?format=txt", {
        headers: CURL,
      }),
      fetchApp,
    );
    expect(await issue!.text()).toBe("/terminal/changelog/3.0.2?format=txt");
  });

  it("passes non-page paths through, and answers their HTML 404s itself", async () => {
    const ics = app(
      () =>
        new Response("BEGIN:VCALENDAR", {
          headers: { "content-type": "text/calendar" },
        }),
    );
    const calendar = await serveTerminal(
      new Request("https://devdogsuga.org/events/calendar.ics", {
        headers: CURL,
      }),
      ics,
    );
    expect(await calendar!.text()).toBe("BEGIN:VCALENDAR");

    const missing = app((request) =>
      new URL(request.url).pathname.startsWith("/terminal")
        ? new Response("terminal 404", { status: 404 })
        : new Response("<html>", {
            status: 404,
            headers: { "content-type": "text/html" },
          }),
    );
    const typo = await serveTerminal(
      new Request("https://devdogsuga.org/changlelog", { headers: CURL }),
      missing,
    );
    expect(await typo!.text()).toBe("terminal 404");
  });

  describe("pages without a terminal twin", () => {
    const html = (body: string, status = 200) =>
      app(
        () =>
          new Response(body, {
            status,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      );

    it("answers with the page's title, its URL and a pointer to the browser", async () => {
      const response = await serveTerminal(
        new Request("https://devdogsuga.org/legal/privacy?format=txt", {
          headers: CURL,
        }),
        html(
          "<html><head><title>Privacy &amp; Terms | DevDogs</title></head><body>…</body></html>",
        ),
      );
      expect(response!.status).toBe(200);
      expect(response!.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(response!.headers.get("cache-control")).toBe("private, no-store");
      const text = await response!.text();
      expect(text).toContain("Privacy & Terms | DevDogs");
      expect(text).toContain("https://devdogsuga.org/legal/privacy");
      expect(text).toContain("browser");
      expect(text).not.toContain("\u001b");
      expect(text).not.toContain("<");
    });

    it("keeps escape sequences in a title out of the terminal", async () => {
      const response = await serveTerminal(
        new Request("https://devdogsuga.org/account", { headers: CURL }),
        html("<title>Account\u001b[2J\u0007 | DevDogs</title>"),
      );
      const text = await response!.text();
      // Only the heading's own bold escape remains.
      expect(text.match(/\u001b/g)).toHaveLength(2);
      expect(text).toContain("Account [2J | DevDogs");
    });

    it("falls back to the site name without a title, and sends no body for HEAD", async () => {
      const get = await serveTerminal(
        new Request("https://devdogsuga.org/account", { headers: CURL }),
        html("<html></html>"),
      );
      expect(await get!.text()).toContain("DevDogs");
      const head = await serveTerminal(
        new Request("https://devdogsuga.org/account", {
          method: "HEAD",
          headers: CURL,
        }),
        html("<title>Account</title>"),
      );
      expect(head!.status).toBe(200);
      expect(await head!.text()).toBe("");
    });

    it("passes redirects and non-HTML responses through", async () => {
      const redirect = app(
        () =>
          new Response(null, {
            status: 307,
            headers: { location: "/auth", "content-type": "text/html" },
          }),
      );
      const response = await serveTerminal(
        new Request("https://devdogsuga.org/account", { headers: CURL }),
        redirect,
      );
      expect(response!.status).toBe(307);
      expect(response!.headers.get("location")).toBe("/auth");
    });
  });

  it("leaves direct /terminal requests to the app", async () => {
    const fetchApp = app(() => new Response("x"));
    expect(
      await serveTerminal(
        new Request("https://devdogsuga.org/terminal/events", {
          headers: CURL,
        }),
        fetchApp,
      ),
    ).toBeNull();
  });
});
