/* =========================
   CONFIG SUPABASE (TES VALEURS)
   ========================= */
const SUPABASE_URL = "https://ikdizsnzfbhuwgkoucvp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrZGl6c256ZmJodXdna291Y3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzI0NjQsImV4cCI6MjA5MTc0ODQ2NH0.JtIkQmdFXrph-rTab--CqpiP8LAC7FiyNi1OMpUaWgk";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);






/* =========================
   UI REFS
   ========================= */
const loginDiv = document.getElementById("login");
const chatApp = document.getElementById("chatApp");

const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const displayNameInput = document.getElementById("displayName");
const accessCodeInput = document.getElementById("accessCode");

const themeBtn = document.getElementById("themeBtn");
const clearBtn = document.getElementById("clearBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");

const peerNameEl = document.getElementById("peerName");
const peerStatusEl = document.getElementById("peerStatus");

const chatEl = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const imageInput = document.getElementById("imageInput");
const sendBtn = document.getElementById("sendBtn");
const cameraBtn = document.getElementById("cameraBtn");
const galleryBtn = document.getElementById("galleryBtn");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");


const replyPreview = document.getElementById("replyPreview");
const replyText = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");




/* =========================
   STATE
   ========================= */
let roomId = null;
let myUserId = null;

let membersCache = new Map();
let peerUserId = null;

let oldestLoaded = null;
let pagingDone = false;

let replyToId = null;

let typingTimer = null;
let presenceTimer = null;
let ticksPollTimer = null;
let realtimeChannel = null;

/* =========================
   THEME
   ========================= */
(function initTheme(){
  const saved = localStorage.getItem("theme");
  if(saved === "dark"){
    document.body.classList.add("dark");
    themeBtn.textContent = "☀️";
  }
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  });
})();

/* =========================
   HELPERS
   ========================= */
function esc(str=""){
  return str.replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}
function formatTime(ts){
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2,"0");
  const m = String(d.getMinutes()).padStart(2,"0");
  return `${h}:${m}`;
}


function isNearBottom(el, px = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < px;
}

let readDebounce = null;

async function markAsRead() {
  if (!roomId || !myUserId) return;

  // Anti-spam : 1 update max par seconde
  if (readDebounce) return;
  readDebounce = setTimeout(() => (readDebounce = null), 1000);

  const { error } = await sb.from("room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", myUserId);

  if (error) console.error("markAsRead error", error);
}


function refreshTicksUI() {
  const peer = peerUserId ? membersCache.get(peerUserId) : null;
  if (!peer) return;

  document.querySelectorAll(".message.mine").forEach(el => {
    const createdAt = el.dataset.createdAt;
    const tickSpan = el.querySelector("[data-ticks]");
    if (!createdAt || !tickSpan) return;

    const msgTime = new Date(createdAt).getTime();

    let ticks = "✓";
    let cls = "ticks ticks-sent";

    if (peer.last_seen_at && new Date(peer.last_seen_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-delivered";
    }

    if (peer.last_read_at && new Date(peer.last_read_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-read";
    }

    tickSpan.textContent = ticks;
    tickSpan.className = cls;
  });
}


/* Reply */
function setReply(msg){
  replyToId = msg.id;
  const author = membersCache.get(msg.user_id)?.display_name || "…";
  const snippet = (msg.text || (msg.image_path ? "[image]" : "") || "").slice(0,80);
  replyText.textContent = `${author} : ${snippet}`;
  replyPreview.style.display = "flex";
}
function clearReply(){
  replyToId = null;
  replyPreview.style.display = "none";
}
cancelReply.addEventListener("click", clearReply);

/* textarea autoresize + typing */
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
  setTyping(true);
});
messageInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
});



chatEl.addEventListener("scroll", () => {
  if (isNearBottom(chatEl)) markAsRead();
});

// =========================
// IMAGE : compression SAFE (support mobile)
// =========================
async function compressImageSafe(file) {
  try {
    // Sécurité mobile : si APIs indisponibles → fallback
    if (!window.HTMLCanvasElement || !window.FileReader) {
      return file;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    URL.revokeObjectURL(url);

    const MAX = 1280;
    const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise(res =>
      canvas.toBlob(res, "image/jpeg", 0.75)
    );

    // Si Safari renvoie null → fallback
    if (!blob) return file;

    return blob;
  } catch (err) {
    console.warn("Compression fallback:", err);
    return file; // ✅ fallback TOTAL
  }
}


/* =========================
   LOGIN
   ========================= */
loginBtn.addEventListener("click", login);

async function login(){
  loginError.textContent = "";

  const code = accessCodeInput.value.trim();
  const name = displayNameInput.value.trim();

  if(!code || !name){
    loginError.textContent = "Merci de renseigner votre nom et votre code.";
    return;
  }
   

  try{
    // Reuse session if possible
    const { data: sess } = await sb.auth.getSession();
    let user = sess?.session?.user;

    if(!user){
      const { data: authData, error: authErr } = await sb.auth.signInAnonymously();
      if(authErr) throw authErr;
      user = authData.user;
    }

    myUserId = user.id;

    // Join via RPC (doit exister côté Supabase)
    const { data, error } = await sb.rpc("join_room_with_code", {
      p_code: code,
      p_display_name: name
    });

    if(error) throw error;
    if(!data || !data.length) throw new Error("Réponse RPC vide");

   
roomId = data[0].room_id;

// Show app
loginDiv.style.display = "none";
chatApp.style.display = "flex";

await refreshMembers();
startTicksPolling();   
subscribeRealtime();
await loadInitialMessages();
if (isNearBottom(chatEl)) markAsRead();
startPresenceLoop();

   

  }catch(err){
    console.error(err);
    loginError.textContent =
      "Connexion impossible. Vérifie le code et que le SQL Supabase est bien installé (RPC + tables).";
  }
}

/* =========================
   MEMBERS / PRESENCE / TYPING
   ========================= */
async function refreshMembers(){
  const { data, error } = await sb
    .from("room_members")
    .select("user_id, display_name, last_seen_at, is_typing, typing_updated_at, last_read_at")
    .eq("room_id", roomId);

  if(error){
    console.error(error);
    return;
  }

  membersCache.clear();
  data.forEach(m => membersCache.set(m.user_id, m));

  const peer = data.find(m => m.user_id !== myUserId);
  peerUserId = peer?.user_id || null;

  peerNameEl.textContent = peer?.display_name || "En attente…";
  updatePeerStatus();
}

function updatePeerStatus(){
  if(!peerUserId){
    peerStatusEl.textContent = "En attente de l’autre personne…";
    return;
  }
  const peer = membersCache.get(peerUserId);
  if(!peer){
    peerStatusEl.textContent = "…";
    return;
  }

  const now = Date.now();
  const lastSeen = new Date(peer.last_seen_at).getTime();
  const online = (now - lastSeen) < 45000;

  const typingFresh = peer.is_typing && peer.typing_updated_at
    && (now - new Date(peer.typing_updated_at).getTime()) < 5000;

  if(typingFresh) peerStatusEl.textContent = "en train d’écrire…";
  else if(online) peerStatusEl.textContent = "en ligne";
  else peerStatusEl.textContent = `en ligne à ${formatTime(peer.last_seen_at)}`;
}

async function setTyping(flag){
  if(!roomId) return;

  if(flag){
    await sb.from("room_members")
      .update({ is_typing:true, typing_updated_at:new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

    if(typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(async () => {
      await sb.from("room_members")
        .update({ is_typing:false, typing_updated_at:new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", myUserId);
    }, 2000);
  }
}

function startPresenceLoop(){
  const ping = async () => {
    if(!roomId || !myUserId) return;

    const { error } = await sb.from("room_members")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

    if (error) console.error("presence ping error", error);
  };

  ping();
  presenceTimer = setInterval(ping, 25000);

  document.addEventListener("visibilitychange", () => {
    if(!document.hidden) ping();
  });

  // iOS-friendly
  window.addEventListener("pageshow", ping);
  window.addEventListener("focus", ping);
  window.addEventListener("touchstart", () => ping(), { passive: true });
}

   
function startTicksPolling(){
  if(ticksPollTimer) clearInterval(ticksPollTimer);

  ticksPollTimer = setInterval(async () => {
    await refreshMembers();   // relit last_read_at de l'autre
    refreshTicksUI();         // met à jour ✓✓ bleu sans refresh page
  }, 3000);
}





/* =========================
   PAGINATION
   ========================= */
loadMoreBtn.addEventListener("click", () => loadMoreMessages(false));

async function loadInitialMessages(){
  chatEl.innerHTML = "";
  oldestLoaded = null;
  pagingDone = false;
  await loadMoreMessages(true);
}

async function loadMoreMessages(scrollBottom){
  if(pagingDone) return;

  const prevHeight = chatEl.scrollHeight;
  const prevTop = chatEl.scrollTop;

  let q = sb.from("messages")
    .select("id, room_id, user_id, text, image_path, reply_to, created_at, deleted_at, reply:reply_to(id, user_id, text, image_path, created_at)")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending:false })
    .limit(30);

  if(oldestLoaded) q = q.lt("created_at", oldestLoaded);

  const { data, error } = await q;
  if(error){
    console.error(error);
    return;
  }

  if(!data || data.length === 0){
    pagingDone = true;
    loadMoreBtn.style.display = "none";
    return;
  }

  oldestLoaded = data[data.length - 1].created_at;
  loadMoreBtn.style.display = "block";

  await refreshMembers();

  const asc = [...data].reverse();
  const frag = document.createDocumentFragment();
  for(const msg of asc){
    frag.appendChild(await buildMessageNode(msg));
  }
  chatEl.prepend(frag);

  const newHeight = chatEl.scrollHeight;
  chatEl.scrollTop = prevTop + (newHeight - prevHeight);
  if(scrollBottom) chatEl.scrollTop = chatEl.scrollHeight;
}

/* =========================
   REALTIME
   ========================= */
function subscribeRealtime(){
  if(realtimeChannel){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = sb.channel("room-" + roomId);

  realtimeChannel
    .on("postgres_changes", {
      event:"INSERT",
      schema:"public",
      table:"messages",
      filter:`room_id=eq.${roomId}`
    }, async (payload) => {
      // refetch for reply join
      const { data } = await sb.from("messages")
        .select("id, room_id, user_id, text, image_path, reply_to, created_at, deleted_at, reply:reply_to(id, user_id, text, image_path, created_at)")
        .eq("id", payload.new.id)
        .single();

      if(!data || data.deleted_at) return;

      await refreshMembers();
      chatEl.appendChild(await buildMessageNode(data));
      chatEl.scrollTop = chatEl.scrollHeight;
      markAsRead();
    })
     
.on("postgres_changes", {
  event: "DELETE",
  schema: "public",
  table: "messages",
  filter: `room_id=eq.${roomId}`
}, (payload) => {
  const deletedId = payload.old?.id;
  if (!deletedId) return;

  const el = chatEl.querySelector(`[data-msg-id="${deletedId}"]`);
  if (el) el.remove();
})

    .on("postgres_changes", {
      event:"UPDATE",
      schema:"public",
      table:"room_members",
      filter:`room_id=eq.${roomId}`
    }, (payload) => {
      membersCache.set(payload.new.user_id, payload.new);
      updatePeerStatus();
      refreshTicksUI();
    })
    .subscribe();
}

/* =========================
   IMAGES (private signed url -> blob)
   ========================= */
async function toBlobUrl(path){
  const { data, error } = await sb.storage.from("chat-images").createSignedUrl(path, 60);
  if(error || !data?.signedUrl) return null;

  const res = await fetch(data.signedUrl);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/* =========================
   RENDER MESSAGE
   ========================= */
async function buildMessageNode(msg){
  const div = document.createElement("div");
  div.className = "message " + (msg.user_id === myUserId ? "mine" : "other");
   div.dataset.msgId = msg.id;
   div.dataset.createdAt = msg.created_at; //

  
let quoteHtml = "";
if (msg.reply) {
  const author = membersCache.get(msg.reply.user_id)?.display_name || "…";
  const snippet = (msg.reply.text || (msg.reply.image_path ? "[image]" : "") || "").slice(0,70);

  // ✅ Miniature si le message auquel on répond contient une image
  let thumbHtml = "";
  if (msg.reply.image_path) {
    const blobUrl = await toBlobUrl(msg.reply.image_path); // utilise déjà signedUrl + blob [1](https://otiselevatorfra-my.sharepoint.com/personal/julien_perinetti_portis_fr).js)
    thumbHtml = blobUrl
      ? `<img class="quote-thumb" src="${blobUrl}" alt="miniature" />`
      : `<span class="quote-thumb placeholder">🖼️</span>`;
  }

  quoteHtml = `
    <div class="quote">
      ${thumbHtml}
      <div class="q-body">
        <div class="q-author">${esc(author)}</div>
        <div class="q-snippet">${esc(snippet)}</div>
      </div>
    </div>`;
}


  const textHtml = msg.text ? `<div class="text">${esc(msg.text)}</div>` : "";

  let imgHtml = "";
  if(msg.image_path){
    const blobUrl = await toBlobUrl(msg.image_path);
    imgHtml = blobUrl ? `<img loading="lazy" src="${blobUrl}" alt="image" />` : `<div class="text" style="opacity:.7;">[image]</div>`;
  }

  let ticksHtml = "";

if (msg.user_id === myUserId) {
  const peer = peerUserId ? membersCache.get(peerUserId) : null;

  // par défaut : envoyé
  let ticks = "✓";
  let cls = "ticks ticks-sent";

  if (peer) {
    const msgTime = new Date(msg.created_at).getTime();

    // (optionnel) livré approx = ✓✓ gris si l’autre a été actif après le message
    if (peer.last_seen_at && new Date(peer.last_seen_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-delivered";
    }

    // vu = ✓✓ bleu si last_read_at >= created_at
    if (peer.last_read_at && new Date(peer.last_read_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-read";
    }
  }

  ticksHtml = ` <span class="${cls}" data-ticks>${ticks}</span>`;
}

const timeHtml = `<div class="status">${formatTime(msg.created_at)}${ticksHtml}</div>`;

  const actionsHtml = `
    <div style="margin-top:4px;">
      <span class="actions" data-a="reply">répondre</span>
      <span class="actions" data-a="delete">supprimer</span>
    </div>`;

  div.innerHTML = `${quoteHtml}${textHtml}${imgHtml}${timeHtml}${actionsHtml}`;

  div.querySelector('[data-a="reply"]').addEventListener("click", () => setReply(msg));
div.querySelector('[data-a="delete"]').addEventListener("click", async () => {
  try {
    const { error } = await sb.from("messages").delete().eq("id", msg.id);
    if (error) throw error;

    // ✅ suppression immédiate dans l’UI
    div.remove();

  } catch (err) {
    console.error(err);
    alert("Erreur suppression : " + (err.message || "inconnue"));
  }
});


  return div;
}



if (cameraBtn && cameraInput) {
  cameraBtn.addEventListener("click", () => cameraInput.click());

  cameraInput.addEventListener("change", () => {
    const file = cameraInput.files?.[0];
    if (file) sendMessage(file);
    cameraInput.value = "";
  });
}

if (galleryBtn && galleryInput) {
  galleryBtn.addEventListener("click", () => galleryInput.click());

  galleryInput.addEventListener("change", () => {
    const file = galleryInput.files?.[0];
    if (file) sendMessage(file);
    galleryInput.value = "";
  });
}

/* =========================
   SEND
   ========================= */

// ⚠️ IMPORTANT : ne pas passer l'event comme paramètre à sendMessage
sendBtn.addEventListener("click", () => sendMessage());

async function sendMessage(fileOverride = null) {
  const text = messageInput.value.trim();

  // ✅ Corrige la ligne cassée + gère l’override
  const file = (fileOverride instanceof File) ? fileOverride : (imageInput.files?.[0] || null);

  if (!text && !file) return;

  let image_path = null;

  try {
    if (file) {
      const safe = file.name.replace(/\s+/g, "_");
      image_path = `room/${roomId}/${myUserId}/${Date.now()}_${safe}`;

      const { error: upErr } = await sb.storage.from("chat-images")
        .upload(image_path, file, { cacheControl: "3600", upsert: false });

 if (file) {
  // Optionnel : limite sur très gros fichiers
  if (file.size > 15 * 1024 * 1024) {
    alert("Image trop lourde (max 15 Mo).");
    return;
  }

  // ✅ Compression simple
  const compressed = await compressImageSafe(file);

  // Nom de fichier propre (on force .jpg)
  image_path = `room/${roomId}/${myUserId}/${Date.now()}.jpg`;

  const { error: upErr } = await sb.storage.from("chat-images")
    .upload(image_path, compressed, {
      cacheControl: "3600",
      upsert: false,
      contentType: "image/jpeg"
    });

  if (upErr) throw upErr;
}

    const payload = {
      room_id: roomId,
      user_id: myUserId,
      text: text || null,
      image_path,
      reply_to: replyToId
    };

    const { error } = await sb.from("messages").insert(payload);
    if (error) throw error;

    messageInput.value = "";
    imageInput.value = "";
    messageInput.style.height = "auto";
    clearReply();

    await sb.from("room_members")
      .update({ is_typing: false, typing_updated_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

  } catch (err) {
    console.error(err);
    alert("Erreur envoi : " + (err.message || "inconnue"));
  }
}


/* =========================
   CLEAR CHAT
   ========================= */
clearBtn.addEventListener("click", async () => {
  if(!roomId) return;
  if(!confirm("Voulez-vous vraiment supprimer tous les messages ?")) return;

  const { error } = await sb.rpc("clear_room_messages", { p_room_id: roomId });
  if(error){
    console.error(error);
    alert("Erreur : " + error.message);
    return;
  }
  await loadInitialMessages();
});

/* =========================
   CLEANUP
   ========================= */
window.addEventListener("beforeunload", () => {
  if(presenceTimer) clearInterval(presenceTimer);
  if(typingTimer) clearTimeout(typingTimer);
  if(ticksPollTimer) clearInterval(ticksPollTimer);
});
