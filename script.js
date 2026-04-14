/* =========================
   SUPABASE CONFIG (FINAL)
   ========================= */
const SUPABASE_URL = "https://ikdizsnzfbhuwgkoucvp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xbdkTKPcST8rWyOZpeGhnA_RhO--F9JI";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* UI */
const loginDiv = document.getElementById("login");
const chatApp = document.getElementById("chatApp");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const displayNameInput = document.getElementById("displayName");
const accessCodeInput = document.getElementById("accessCode");

const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const imageInput = document.getElementById("imageInput");
const sendBtn = document.getElementById("sendBtn");

const peerName = document.getElementById("peerName");
const peerStatus = document.getElementById("peerStatus");

const clearBtn = document.getElementById("clearBtn");
const themeBtn = document.getElementById("themeBtn");

/* STATE */
let roomId = null;
let myUserId = null;

/* DARK MODE */
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  themeBtn.textContent = "☀️";
}
themeBtn.onclick = () => {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  themeBtn.textContent = dark ? "☀️" : "🌙";
};

/* LOGIN */
loginBtn.onclick = async () => {
  loginError.textContent = "";

  const name = displayNameInput.value.trim();
  const code = accessCodeInput.value.trim();
  if (!name || !code) {
    loginError.textContent = "Nom et code requis";
    return;
  }

  const { data: sess } = await sb.auth.getSession();
  let user = sess.session?.user;

  if (!user) {
    const { data } = await sb.auth.signInAnonymously();
    user = data.user;
  }

  myUserId = user.id;

  const { data, error } = await sb.rpc("join_room_with_code", {
    p_code: code,
    p_display_name: name
  });

  if (error) {
    loginError.textContent = "Code invalide ou déjà utilisé";
    return;
  }

  roomId = data[0].room_id;
  loginDiv.style.display = "none";
  chatApp.style.display = "flex";

  loadMessages();
  listenRealtime();
};

/* LOAD MESSAGES */
async function loadMessages() {
  chat.innerHTML = "";
  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  data.forEach(renderMessage);
}

/* REALTIME */
function listenRealtime() {
  sb.channel("chat-" + roomId)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `room_id=eq.${roomId}`
    }, payload => renderMessage(payload.new))
    .subscribe();
}

/* RENDER */
function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "message " + (msg.user_id === myUserId ? "mine" : "other");
  div.innerHTML = `
    ${msg.text || ""}
    ${msg.image_path ? `<img src="${msg.image_path}">` : ""}
    <div class="status">${new Date(msg.created_at).toLocaleTimeString().slice(0,5)}</div>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* SEND */
sendBtn.onclick = async () => {
  const text = messageInput.value.trim();
  const file = imageInput.files[0];
  if (!text && !file) return;

  let image_path = null;

  if (file) {
