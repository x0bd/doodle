//! Doodle as an MCP server, for the agent's turns (plan §9, §11.3).
//!
//! A small Streamable-HTTP MCP endpoint on 127.0.0.1, on a port the system
//! picks, behind a token made fresh at every launch. Codex is handed it per
//! thread (`codex.rs`, `thread/start` → `config.mcp_servers.doodle`), never
//! through the user's own `~/.codex/config.toml`. The document lives in the
//! webview, so every request that needs it is passed there as a `mcp` event
//! and answered with `mcp_reply`; this side only speaks the protocol.
//!
//! What the tools may do is the plan's default for an assistant: observe
//! and propose. Nothing here changes the document — a proposal waits on
//! its page until the writer keeps it.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

pub struct Endpoint {
    pub url: String,
    pub token: String,
}

static ENDPOINT: OnceLock<Endpoint> = OnceLock::new();
static NEXT: AtomicU64 = AtomicU64::new(1);
type Waiting = Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>;
static WAITING: OnceLock<Waiting> = OnceLock::new();

/// where the agent reaches Doodle, once it is listening
pub fn endpoint() -> Option<&'static Endpoint> {
    ENDPOINT.get()
}

/// a token no other process on the machine can guess
fn token() -> String {
    let mut h = Sha256::new();
    h.update(format!("{:?}{}", std::time::SystemTime::now(), std::process::id()));
    let local = 0u8;
    h.update(format!("{:p}", &local));
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let mut b = [0u8; 32];
        if f.read_exact(&mut b).is_ok() {
            h.update(b);
        }
    }
    hex::encode(h.finalize())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Call {
    id: u64,
    method: String,
    params: Value,
}

/// Start listening. Called once, at setup.
pub fn start(app: &AppHandle) {
    let server = match tiny_http::Server::http("127.0.0.1:0") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mcp] could not listen: {e}");
            crate::logs::warn("mcp", &format!("could not listen: {e}"));
            return;
        }
    };
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let secret = token();
    let _ = ENDPOINT.set(Endpoint { url: format!("http://127.0.0.1:{port}/mcp"), token: secret.clone() });
    eprintln!("[mcp] listening on 127.0.0.1:{port}");
    crate::logs::info("mcp", &format!("listening on 127.0.0.1:{port}")); // the port only, never the token
    let waiting: Waiting = WAITING.get_or_init(Arc::default).clone();
    let app = app.clone();
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let app = app.clone();
            let waiting = waiting.clone();
            let secret = secret.clone();
            // one thread per request: a tool that waits on the page must not hold up the next
            std::thread::spawn(move || handle(req, &app, &waiting, &secret));
        }
    });
}

fn respond(req: tiny_http::Request, status: u16, body: Option<Value>) {
    let mut r = tiny_http::Response::from_string(body.map(|b| b.to_string()).unwrap_or_default()).with_status_code(status);
    if let Ok(h) = tiny_http::Header::from_bytes("Content-Type", "application/json") {
        r.add_header(h);
    }
    let _ = req.respond(r);
}

fn handle(mut req: tiny_http::Request, app: &AppHandle, waiting: &Waiting, secret: &str) {
    let authed = req.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {secret}"));
    if !authed {
        return respond(req, 401, None);
    }
    if req.url() != "/mcp" {
        return respond(req, 404, None);
    }
    match req.method() {
        tiny_http::Method::Post => {}
        tiny_http::Method::Delete => return respond(req, 200, None),
        // no stream of its own to offer: every answer comes back on the POST
        _ => return respond(req, 405, None),
    }
    let mut raw = String::new();
    if req.as_reader().take(4 * 1024 * 1024).read_to_string(&mut raw).is_err() {
        return respond(req, 400, None);
    }
    let Ok(msg) = serde_json::from_str::<Value>(&raw) else { return respond(req, 400, None) };
    // a notification, or an answer to something never asked: acknowledged
    let Some(id) = msg.get("id").cloned() else { return respond(req, 202, None) };
    let method = msg["method"].as_str().unwrap_or("").to_string();
    let params = msg.get("params").cloned().unwrap_or(Value::Null);

    let result: Result<Value, (i64, String)> = match method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "doodle", "title": "Doodle", "version": env!("CARGO_PKG_VERSION") },
            "instructions": "The document open in Doodle. Read it with the doodle_* tools; propose with the propose_* tools. Nothing you propose changes the document until the writer keeps it.",
        })),
        "ping" => Ok(json!({})),
        "tools/list" | "tools/call" => ask_page(app, waiting, &method, params).map_err(|e| (-32603, e)),
        _ => Err((-32601, format!("No method {method}"))),
    };
    let body = match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    };
    respond(req, 200, Some(body));
}

/// the page answers: the request goes over as an event, the answer comes
/// back through `mcp_reply`
fn ask_page(app: &AppHandle, waiting: &Waiting, method: &str, params: Value) -> Result<Value, String> {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    waiting.lock().unwrap().insert(id, tx);
    app.emit("mcp", Call { id, method: method.to_string(), params }).map_err(|e| e.to_string())?;
    let answer = rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "Doodle did not answer in time".to_string());
    waiting.lock().unwrap().remove(&id);
    answer?
}

/// The page's answer to a request it was passed.
#[tauri::command]
pub fn mcp_reply(id: u64, result: Option<Value>, error: Option<String>) {
    let Some(waiting) = WAITING.get() else { return };
    if let Some(tx) = waiting.lock().unwrap().remove(&id) {
        let _ = tx.send(match error {
            Some(e) => Err(e),
            None => Ok(result.unwrap_or(Value::Null)),
        });
    }
}
