import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createRoom,
  ensureParticipant,
  getOwnResponses,
  getRoom,
  getRoomStatus,
  hasSubmitted,
  isOrganiser,
  RoomFullError,
  submitResponse,
  ValidationError,
  type Choice,
  type RoomStatus,
} from "./rooms.ts";
import { broadcast, subscribe, writeEvent } from "./live.ts";
import { escapeHtml, page } from "./html.ts";
import { logJoined, logRejected, logRevealed, logSubmitted } from "./log.ts";

const README = readFileSync("README.md", "utf8");

// --- tiny cookie helpers -------------------------------------------------

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Identity is a per-room participant id, carried in a cookie scoped to that
// room's path. That's what makes a second browser (no cookie) "another
// person": it gets a fresh id and never sees the first one's private marks.
function participantCookieName(roomId: string): string {
  return `participant_${roomId}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseForm(body: string): Record<string, string[]> {
  const params = new URLSearchParams(body);
  const out: Record<string, string[]> = {};
  for (const key of params.keys()) {
    if (!out[key]) out[key] = params.getAll(key);
  }
  return out;
}

// --- views -----------------------------------------------------------------

function homePage(): string {
  return page(
    "bigger than 2",
    `
      <h1>bigger than 2</h1>
      <p>Create a round: a question, 2–3 options, and how many people will answer.</p>
      <form method="post" action="/rooms">
        <label>Question<br /><input name="question" required maxlength="200" /></label><br /><br />
        <label>Option 1<br /><input name="option" required maxlength="100" /></label><br />
        <label>Option 2<br /><input name="option" required maxlength="100" /></label><br />
        <label>Option 3 (optional)<br /><input name="option" maxlength="100" /></label><br /><br />
        <label>Expected participants (including you)<br />
          <select name="expectedParticipants">
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label><br /><br />
        <button type="submit">Create room</button>
      </form>
      <p><a href="/readme/">About this app</a></p>
    `,
  );
}

function optionRow(index: number, label: string, current: Choice | undefined, disabled: boolean): string {
  const name = `choice_${index}`;
  const opts: { value: Choice; label: string }[] = [
    { value: "first", label: "First choice" },
    { value: "acceptable", label: "Acceptable" },
    { value: "ask-first", label: "Ask me first" },
  ];
  const radios = opts
    .map(
      (o) => `
        <label>
          <input type="radio" name="${name}" value="${o.value}" ${current === o.value ? "checked" : ""} ${disabled ? "disabled" : ""} required />
          ${o.label}
        </label>`,
    )
    .join("");
  return `<fieldset><legend>${escapeHtml(label)}</legend>${radios}</fieldset>`;
}

// Rendered both on first page load (so the page is correct with no JS and
// before the SSE connection opens) and inside the client script below,
// which replaces #status's innerHTML with this same shape on every live
// update. Keeping one function for both means the two can't drift apart.
function statusHtml(status: RoomStatus, options: string[]): string {
  if (!status.reveal) {
    return `<p id="status-text">${status.submitted} of ${status.expected} submitted</p>`;
  }
  const { accepted, discuss } = status.reveal;
  const list = (indices: number[]): string =>
    indices.length > 0
      ? `<ul>${indices.map((i) => `<li>${escapeHtml(options[i])}</li>`).join("")}</ul>`
      : "<p><em>none</em></p>";
  return `
    <p id="status-text"><strong>Everyone has submitted.</strong> The group makes the final call — this just shows what's already agreed.</p>
    <h2>Everyone can accept</h2>
    ${list(accepted)}
    <h2>Needs discussion</h2>
    ${list(discuss)}
  `;
}

function roomPage(opts: {
  roomId: string;
  question: string;
  options: string[];
  expectedParticipants: number;
  isOrganiser: boolean;
  submitted: boolean;
  ownMarks: Record<number, Choice>;
  status: RoomStatus;
  error?: string;
  shareUrl: string;
}): string {
  const { roomId, question, options, expectedParticipants, submitted, ownMarks, status, error, shareUrl } = opts;

  const rows = options.map((label, i) => optionRow(i, label, ownMarks[i], submitted)).join("\n");

  const form = submitted
    ? `<p><strong>Your response is recorded.</strong> You marked:</p>
       <ul>${options.map((label, i) => `<li>${escapeHtml(label)}: ${escapeHtml(ownMarks[i] ?? "")}</li>`).join("")}</ul>`
    : `<form method="post" action="/rooms/${roomId}/responses">
         ${rows}
         <p><em>No favourite is valid — you can mark every option "Acceptable" or "Ask me first".</em></p>
         <button type="submit">Submit my response</button>
       </form>`;

  return page(
    question,
    `
      <p><a href="/">&larr; new round</a></p>
      <h1>${escapeHtml(question)}</h1>
      <p>Expected participants: ${expectedParticipants}</p>
      <p>Share this link with the group: <code>${escapeHtml(shareUrl)}</code></p>
      ${error ? `<p role="alert" style="color: #b00;">${escapeHtml(error)}</p>` : ""}
      ${form}
      <div id="status">${statusHtml(status, options)}</div>
      <script src="/live.js" data-room="${roomId}"></script>
    `,
  );
}

function notFoundPage(): string {
  return page("Not found", `<h1>Not found</h1><p>This room doesn't exist.</p><p><a href="/">Start a new round</a></p>`);
}

// --- request handling --------------------------------------------------

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Fly terminates TLS and proxies plain HTTP to the app (fly.toml), so the
  // app itself never sees https; the share link still needs to say https in
  // production, so it's inferred from the host rather than the connection.
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const origin = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? `http://${host}` : `https://${host}`;

  if (req.method === "GET" && url.pathname === "/") {
    send(res, 200, homePage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/readme/") {
    send(
      res,
      200,
      page("About", `<pre>${escapeHtml(README)}</pre>`),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/style.css") {
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(
      "body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}" +
        "fieldset{margin-bottom:1rem}label{display:block;margin:.25rem 0}",
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/live.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    // Replaces #status wholesale with each event's HTML — the server
    // already reduced the data to what's safe to show, so the client has
    // no choice logic of its own to keep in sync.
    res.end(
      `(function(){var s=document.currentScript;var es=new EventSource("/rooms/"+s.dataset.room+"/live");` +
        `es.onmessage=function(e){document.getElementById("status").innerHTML=e.data;};})();`,
    );
    return;
  }

  const liveMatch = url.pathname.match(/^\/rooms\/([^/]+)\/live$/);
  if (req.method === "GET" && liveMatch) {
    const roomId = liveMatch[1];
    const room = getRoom(roomId);
    if (!room) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    // Sent to this connection only (not broadcast — that would re-push to
    // every other open tab in the room). Covers the gap between the page's
    // initial HTML being generated and this connection opening: without
    // it, a submission landing in that window would be missed until the
    // next one.
    writeEvent(res, statusHtml(getRoomStatus(roomId), room.options));
    subscribe(roomId, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/rooms") {
    const body = parseForm(await readBody(req));
    try {
      const { room, organiserId } = createRoom({
        question: body.question?.[0] ?? "",
        options: body.option ?? [],
        expectedParticipants: Number(body.expectedParticipants?.[0]),
      });
      logJoined(room.id, organiserId, true);
      const cookie = `${participantCookieName(room.id)}=${organiserId}; Path=/rooms/${room.id}; HttpOnly; SameSite=Lax`;
      send(res, 303, "", { Location: `/rooms/${room.id}`, "Set-Cookie": cookie });
    } catch (err) {
      if (err instanceof ValidationError) {
        send(res, 400, page("Error", `<p role="alert">${escapeHtml(err.message)}</p><p><a href="/">Back</a></p>`));
        return;
      }
      throw err;
    }
    return;
  }

  const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
  if (req.method === "GET" && roomMatch) {
    const roomId = roomMatch[1];
    const room = getRoom(roomId);
    if (!room) {
      send(res, 404, notFoundPage());
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieName = participantCookieName(roomId);
    let participantId = cookies[cookieName];
    const headers: Record<string, string> = {};
    const isNewParticipant = !participantId;

    if (!participantId) participantId = randomUUID();

    try {
      // idempotent for a returning participant (organiser or not): already
      // a row, so this is a no-op (rooms.ts: ON CONFLICT DO NOTHING). For a
      // new one, this is where room capacity is enforced server-side.
      ensureParticipant(roomId, participantId);
    } catch (err) {
      if (err instanceof RoomFullError) {
        logRejected(roomId, participantId, "room full");
        send(res, 403, page("Room full", `<p role="alert">${escapeHtml(err.message)}</p>`));
        return;
      }
      throw err;
    }

    if (isNewParticipant) {
      headers["Set-Cookie"] = `${cookieName}=${participantId}; Path=/rooms/${roomId}; HttpOnly; SameSite=Lax`;
      logJoined(roomId, participantId, isOrganiser(roomId, participantId));
    }

    send(
      res,
      200,
      roomPage({
        roomId,
        question: room.question,
        options: room.options,
        expectedParticipants: room.expectedParticipants,
        isOrganiser: isOrganiser(roomId, participantId),
        submitted: hasSubmitted(roomId, participantId),
        ownMarks: getOwnResponses(roomId, participantId),
        status: getRoomStatus(roomId),
        shareUrl: `${origin}/rooms/${roomId}`,
      }),
      headers,
    );
    return;
  }

  const responseMatch = url.pathname.match(/^\/rooms\/([^/]+)\/responses$/);
  if (req.method === "POST" && responseMatch) {
    const roomId = responseMatch[1];
    const room = getRoom(roomId);
    if (!room) {
      send(res, 404, notFoundPage());
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const participantId = cookies[participantCookieName(roomId)];
    if (!participantId) {
      // No cookie means this browser never opened the room page to get an
      // identity; there's nothing to attribute the submission to.
      send(res, 400, page("Error", `<p role="alert">Open the room link first.</p>`));
      return;
    }

    const body = parseForm(await readBody(req));
    const marks: Record<number, Choice> = {};
    for (let i = 0; i < room.options.length; i++) {
      const value = body[`choice_${i}`]?.[0];
      if (value === "first" || value === "acceptable" || value === "ask-first") marks[i] = value;
    }

    try {
      submitResponse(roomId, participantId, marks);
      logSubmitted(roomId, participantId);
      const status = getRoomStatus(roomId);
      if (status.reveal) logRevealed(roomId, status.submitted, status.expected);
      broadcast(roomId, statusHtml(status, room.options));
      send(res, 303, "", { Location: `/rooms/${roomId}` });
    } catch (err) {
      if (err instanceof ValidationError) {
        logRejected(roomId, participantId, err.message);
        send(
          res,
          400,
          roomPage({
            roomId,
            question: room.question,
            options: room.options,
            expectedParticipants: room.expectedParticipants,
            isOrganiser: isOrganiser(roomId, participantId),
            submitted: hasSubmitted(roomId, participantId),
            ownMarks: marks,
            status: getRoomStatus(roomId),
            error: err.message,
            shareUrl: `${origin}/rooms/${roomId}`,
          }),
        );
        return;
      }
      throw err;
    }
    return;
  }

  send(res, 404, notFoundPage());
}

const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    send(res, 500, page("Error", "<p>Something went wrong.</p>"));
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
